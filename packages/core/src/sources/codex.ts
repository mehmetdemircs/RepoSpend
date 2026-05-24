import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type { CommandCategory, CommandIssueClassification, CommandIssueImpact, CommandIssueSample, CommandIssueSeverity, CompactionStats, NormalizedUsage, PromptTimelineItem, RepoSpendConfig, SourceStatus } from "@repospend/types";
import { readJsonCache, writeJsonCache } from "../cache.js";
import { calculateCostUsd, type PricingTable } from "../pricing.js";
import { resolveRepoInfo } from "../repo.js";
import { analyzeAgentFriction, type CommandIssue } from "./agent-friction.js";
import { aggregateTokens, type CodexTokenAggregation } from "./codex-token.js";
import type { SourceScanWindow } from "./index.js";

interface CodexThreadRow {
  id?: unknown;
  rollout_path?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  cwd?: unknown;
  title?: unknown;
  model_provider?: unknown;
  model?: unknown;
  tokens_used?: unknown;
  source?: unknown;
  thread_source?: unknown;
}

type ImportedModel = { model: string; provider: string | undefined };

const codexSessionCacheVersion = "codex-session-v1";
let nativeSqliteRebuildAttempted = false;

interface SessionTokenBreakdown extends CodexTokenAggregation {
  id: string | undefined;
  cwd: string | undefined;
  title: string | undefined;
  startedAt: string | undefined;
  endedAt: string | undefined;
  model: string | undefined;
  provider: string | undefined;
  messageCount: number;
  source: string | undefined;
  originator: string | undefined;
  threadSource: string | undefined;
  rawEventCount: number;
  parseStatus: "ok" | "partial" | "failed";
  parseErrors: string[];
  userPromptCount: number;
  assistantMessageCount: number;
  toolCallCount: number;
  shellCommandCount: number;
  failedToolCallCount: number;
  commandIssues: CommandIssue[];
  nonZeroCommandEvents: number;
  importantCommandFailures: number;
  harmlessNonZeroEvents: number;
  exploratoryMisses: number;
  repeatedFailureClusters: number;
  commandIssueSeverity: CommandIssueSeverity;
  commandIssueImpact: CommandIssueImpact;
  topFailureType: CommandCategory | CommandIssueClassification | undefined;
  commandIssueSamples: CommandIssueSample[];
  fileReadCount: number;
  fileEditCount: number;
  promptTimeline: PromptTimelineItem[];
  compaction: CompactionStats;
  warnings: string[];
}

export interface CodexAdapterOptions {
  codexHome?: string;
  config?: RepoSpendConfig;
  scanWindow?: SourceScanWindow;
  pricing: PricingTable;
}

export interface CodexScanResult {
  source: SourceStatus;
  sessions: NormalizedUsage[];
  stats: CodexScanStats;
}

export interface CodexScanStats {
  sourceId: "codex";
  sourceLabel: "Codex";
  homePath: string;
  codexHome: string;
  statePath: string;
  sessionsPath: string;
  stateExists: boolean;
  sessionsExists: boolean;
  sessionFileCount: number;
  sessionsImported: number;
  parseFailureCount: number;
  unreadableFileCount: number;
  lastScannedAt: string;
}

export function scanCodex(options: CodexAdapterOptions): CodexScanResult {
  const codexHome = options.codexHome ?? path.join(os.homedir(), ".codex");
  const statePath = path.join(codexHome, "state_5.sqlite");
  const sessionsPath = path.join(codexHome, "sessions");
  const warnings: string[] = [];
  const sessions: NormalizedUsage[] = [];

  const stateExists = fs.existsSync(statePath);
  const sessionsExists = fs.existsSync(sessionsPath);

  if (!stateExists) {
    warnings.push(`Codex SQLite state not found at ${statePath}`);
  }
  if (!sessionsExists) {
    warnings.push(`Codex sessions directory not found at ${sessionsPath}`);
  }

  const sessionFiles = sessionsExists ? indexSessionFiles(sessionsPath, warnings, options.scanWindow) : new Map<string, string>();
  if (stateExists) {
    const stateSessions = readThreads(statePath, sessionFiles, options, warnings);
    sessions.push(...stateSessions);
  }

  if (sessionsExists) {
    sessions.push(...readStandaloneSessions(remainingStandaloneSessionFiles(sessionFiles, sessions), options).filter((session) => !hasImportedSession(sessions, session)));
  }

  return {
    source: {
      id: "codex",
      label: "Codex",
      available: stateExists || sessionsExists,
      paths: [statePath, sessionsPath],
      warnings,
    },
    sessions,
    stats: {
      sourceId: "codex",
      sourceLabel: "Codex",
      homePath: codexHome,
      codexHome,
      statePath,
      sessionsPath,
      stateExists,
      sessionsExists,
      sessionFileCount: sessionFiles.size,
      sessionsImported: sessions.length,
      parseFailureCount: sessions.filter((session) => session.parseStatus === "failed").length,
      unreadableFileCount: sessions.filter((session) => session.parseErrors?.some((error) => error.startsWith("unable_to_read_session_file:"))).length,
      lastScannedAt: new Date().toISOString(),
    },
  };
}

function readThreads(statePath: string, sessionFiles: Map<string, string>, options: CodexAdapterOptions, warnings: string[]): NormalizedUsage[] {
  let db: Database.Database | undefined;
  try {
    db = openCodexStateDatabase(statePath, warnings);
    const tableNames = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    if (!tableNames.some((table) => table.name === "threads")) {
      warnings.push("Codex SQLite state does not contain a threads table.");
      return [];
    }

    const columns = (db.prepare("PRAGMA table_info(threads)").all() as Array<{ name: string }>).map((column) => column.name);
    const selectedColumns = ["id", "rollout_path", "created_at", "updated_at", "cwd", "title", "model_provider", "model", "tokens_used", "source", "thread_source"].filter((column) => columns.includes(column));
    if (!selectedColumns.length) {
      warnings.push("Codex threads table has no recognized columns.");
      return [];
    }

    const importedModels = readImportedModelMap(options.codexHome ?? path.join(os.homedir(), ".codex"), warnings);
    const rows = (db.prepare(`SELECT ${selectedColumns.map((column) => `"${column}"`).join(", ")} FROM threads`).all() as CodexThreadRow[])
      .filter((row) => rowMatchesScanWindow(row, options.scanWindow));
    const sessions = rows.map((row, index) => threadToUsage(row, index, sessionFiles, options, importedModels));
    return attributeSubagentsToParentSurfaces(sessions, rows);
  } catch (error) {
    warnings.push(`Unable to read Codex SQLite state at ${statePath}: ${errorMessage(error)}`);
    return [];
  } finally {
    db?.close();
  }
}

function attributeSubagentsToParentSurfaces(sessions: NormalizedUsage[], rows: CodexThreadRow[]): NormalizedUsage[] {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const parentIdsByChildId = new Map<string, string>();
  for (const row of rows) {
    const childId = stringValue(row.id);
    const parentId = codexParentThreadId(stringValue(row.source));
    if (childId && parentId) parentIdsByChildId.set(childId, parentId);
  }

  return sessions.map((session) => {
    if (session.sourceApp !== "Codex subagent") return session;
    const parent = sessionsById.get(parentIdsByChildId.get(session.id) ?? "");
    if (!parent || parent.sourceApp === "Codex subagent") return session;
    return {
      ...session,
      sourceApp: parent.sourceApp,
      sourceAppRaw: session.sourceAppRaw,
      surfaceReason: `subagent attributed to parent thread ${parent.id}: ${parent.surfaceReason}`,
    };
  });
}

function codexParentThreadId(source: string | undefined): string | undefined {
  if (!source?.trim().startsWith("{")) return undefined;
  try {
    const object = asRecord(JSON.parse(source));
    const subagent = asRecord(object?.subagent);
    const threadSpawn = asRecord(subagent?.thread_spawn);
    return stringValue(threadSpawn?.parent_thread_id);
  } catch {
    return undefined;
  }
}

function openCodexStateDatabase(statePath: string, warnings: string[]): Database.Database {
  try {
    return new Database(statePath, { readonly: true, fileMustExist: true });
  } catch (error) {
    if (isNativeSqliteMismatch(error) && attemptNativeSqliteRebuild(warnings)) {
      return new Database(statePath, { readonly: true, fileMustExist: true });
    }
    throw error;
  }
}

function attemptNativeSqliteRebuild(warnings: string[]): boolean {
  if (nativeSqliteRebuildAttempted || process.env.REPOSPEND_SKIP_NATIVE_REBUILD === "1") return false;
  nativeSqliteRebuildAttempted = true;

  const packageRoot = findRepoSpendPackageRoot();
  if (!packageRoot) {
    warnings.push("Codex SQLite native module mismatch detected, but RepoSpend could not locate its package root for an automatic rebuild.");
    return false;
  }

  const packageManager = fs.existsSync(path.join(packageRoot, "pnpm-lock.yaml")) ? "pnpm" : "npm";
  const result = spawnSync(packageManager, ["rebuild", "better-sqlite3"], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: "pipe",
    timeout: 120_000,
  });
  if (result.status === 0) return true;

  const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").split("\n").map((line) => line.trim()).filter(Boolean).slice(-3).join(" ");
  warnings.push(`Codex SQLite native module mismatch detected. RepoSpend tried to rebuild better-sqlite3 automatically with ${packageManager}, but it failed${exitLabel(result.status)}.${detail ? ` ${detail}` : ""}`);
  return false;
}

function findRepoSpendPackageRoot(): string | undefined {
  const starts = [
    process.argv[1] ? path.dirname(fs.realpathSync(process.argv[1])) : undefined,
    path.dirname(fileURLToPath(import.meta.url)),
    process.cwd(),
  ].filter((item): item is string => Boolean(item));
  for (const start of starts) {
    const root = findPackageRootNamedRepoSpend(start);
    if (root) return root;
  }
  return undefined;
}

function findPackageRootNamedRepoSpend(start: string): string | undefined {
  let current = path.resolve(start);
  while (true) {
    const packagePath = path.join(current, "package.json");
    if (fs.existsSync(packagePath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { name?: unknown };
        if (packageJson.name === "repospend") return current;
      } catch {
        // Keep walking; a malformed package.json should not stop a scan.
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function isNativeSqliteMismatch(error: unknown): boolean {
  return errorMessage(error).includes("NODE_MODULE_VERSION");
}

function exitLabel(status: number | null): string {
  return status === null ? "" : ` with exit code ${status}`;
}

function threadToUsage(row: CodexThreadRow, index: number, sessionFiles: Map<string, string>, options: CodexAdapterOptions, importedModels = new Map<string, ImportedModel>()): NormalizedUsage {
  const id = stringValue(row.id) ?? `codex-thread-${index}`;
  const sourcePath = stringValue(row.rollout_path) ?? matchSessionPath(stringValue(row.id), sessionFiles) ?? "";
  const sessionBreakdown = sourcePath ? readSessionBreakdown(sourcePath) : emptyBreakdown();
  const dbTokens = parseTokenTotal(row.tokens_used);
  const cwd = stringValue(row.cwd) ?? sessionBreakdown.cwd ?? fallbackCwdFromPath(sourcePath);
  const repo = resolveRepoInfo(cwd, options.config);
  const inferredModel = stringValue(row.model) || sessionBreakdown.model ? undefined : importedModels.get(id);
  const model = stringValue(row.model) ?? sessionBreakdown.model ?? inferredModel?.model;
  const provider = sessionBreakdown.provider ?? inferredModel?.provider ?? stringValue(row.model_provider);
  const inputTokens = sessionBreakdown.inputTokens;
  const cachedInputTokens = sessionBreakdown.cachedInputTokens;
  const outputTokens = sessionBreakdown.outputTokens;
  const reasoningTokens = sessionBreakdown.reasoningTokens;
  const totalTokens = sessionBreakdown.totalTokens || dbTokens || inputTokens + outputTokens + reasoningTokens;
  const hasPricedBreakdown = inputTokens + cachedInputTokens + outputTokens + reasoningTokens > 0;
  const warnings = [...repo.warnings, ...sessionBreakdown.warnings, ...(inferredModel ? ["model_inferred_from_import_source"] : [])];
  const threadSource = stringValue(row.thread_source) ?? sessionBreakdown.threadSource;
  const sourceAppRaw = codexSourceRaw(stringValue(row.source), sessionBreakdown.source, sessionBreakdown.originator, threadSource);
  const surface = detectSurface(sourceAppRaw, threadSource);
  const startedAt = dateValue(row.created_at) ?? sessionBreakdown.startedAt;
  const endedAt = dateValue(row.updated_at) ?? sessionBreakdown.endedAt;
  const usage: NormalizedUsage = {
    id,
    sourceClient: "codex",
    sourceApp: codexSourceAppLabel(sourceAppRaw, threadSource),
    sourceAppRaw,
    sourcePath,
    repoRoot: repo.repoRoot,
    repoName: repo.repoName,
    cwd,
    gitRemoteUrl: repo.gitRemoteUrl,
    gitBranch: repo.gitBranch,
    title: stringValue(row.title) ?? sessionBreakdown.title,
    startedAt,
    endedAt,
    model,
    provider,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    reasoningOutputTokens: reasoningTokens,
    totalTokens,
    tokenAggregationMethod: sessionBreakdown.tokenAggregationMethod === "unknown" && dbTokens > 0 ? "estimated" : sessionBreakdown.tokenAggregationMethod,
    tokenConfidence: sessionBreakdown.tokenAggregationMethod === "unknown" && dbTokens > 0 ? "low" : sessionBreakdown.tokenConfidence,
    tokenSnapshotCount: sessionBreakdown.tokenSnapshotCount,
    estimatedCostUsd: undefined,
    messageCount: sessionBreakdown.messageCount,
    rawTokenTotal: dbTokens || sessionBreakdown.totalTokens || undefined,
    warnings,
    codexHome: options.codexHome ?? path.join(os.homedir(), ".codex"),
    durationMs: durationMs(startedAt, endedAt),
    rawEventCount: sessionBreakdown.rawEventCount,
    parseStatus: sessionBreakdown.parseStatus,
    parseErrors: sessionBreakdown.parseErrors,
    detectedSurface: surface.surface,
    surfaceConfidence: surface.confidence,
    surfaceReason: surface.reason,
    userPromptCount: sessionBreakdown.userPromptCount,
    assistantMessageCount: sessionBreakdown.assistantMessageCount,
    toolCallCount: sessionBreakdown.toolCallCount,
    shellCommandCount: sessionBreakdown.shellCommandCount,
    failedToolCallCount: sessionBreakdown.failedToolCallCount,
    nonZeroCommandEvents: sessionBreakdown.nonZeroCommandEvents,
    importantCommandFailures: sessionBreakdown.importantCommandFailures,
    harmlessNonZeroEvents: sessionBreakdown.harmlessNonZeroEvents,
    exploratoryMisses: sessionBreakdown.exploratoryMisses,
    repeatedFailureClusters: sessionBreakdown.repeatedFailureClusters,
    commandIssueSeverity: sessionBreakdown.commandIssueSeverity,
    commandIssueImpact: sessionBreakdown.commandIssueImpact,
    topFailureType: sessionBreakdown.topFailureType,
    commandIssueSamples: sessionBreakdown.commandIssueSamples,
    fileReadCount: sessionBreakdown.fileReadCount,
    fileEditCount: sessionBreakdown.fileEditCount,
    promptTimeline: sessionBreakdown.promptTimeline,
    sessionOutcome: inferOutcome(sessionBreakdown),
    compaction: sessionBreakdown.compaction,
  };
  const cost = hasPricedBreakdown ? calculateCostUsd(usage, options.pricing) : undefined;
  const costWarnings = hasPricedBreakdown ? warnings : [...warnings, "missing_token_breakdown"];
  return {
    ...usage,
    estimatedCostUsd: cost,
    warnings: cost === undefined ? [...costWarnings, "unknown_pricing"] : warnings,
  };
}

function readStandaloneSessions(sessionFiles: Map<string, string>, options: CodexAdapterOptions): NormalizedUsage[] {
  return [...sessionFiles.entries()].map(([id, sourcePath]) => {
    const breakdown = readSessionBreakdown(sourcePath);
    const cwd = breakdown.cwd ?? fallbackCwdFromPath(sourcePath);
    const repo = resolveRepoInfo(cwd, options.config);
    const model = breakdown.model;
    const provider = breakdown.provider ?? providerForModel(model ?? "");
    const sourceAppRaw = codexSourceRaw(undefined, breakdown.source, breakdown.originator, breakdown.threadSource);
    const surface = detectSurface(sourceAppRaw, breakdown.threadSource);
    const usage: NormalizedUsage = {
      id: breakdown.id ?? id,
      sourceClient: "codex",
      sourceApp: codexSourceAppLabel(sourceAppRaw, breakdown.threadSource),
      sourceAppRaw,
      sourcePath,
      repoRoot: repo.repoRoot,
      repoName: repo.repoName,
      cwd,
      gitRemoteUrl: repo.gitRemoteUrl,
      gitBranch: repo.gitBranch,
      title: breakdown.title,
      startedAt: breakdown.startedAt,
      endedAt: breakdown.endedAt,
      model,
      provider,
      inputTokens: breakdown.inputTokens,
      cachedInputTokens: breakdown.cachedInputTokens,
      outputTokens: breakdown.outputTokens,
      reasoningTokens: breakdown.reasoningTokens,
      reasoningOutputTokens: breakdown.reasoningTokens,
      totalTokens: breakdown.totalTokens,
      tokenAggregationMethod: breakdown.tokenAggregationMethod,
      tokenConfidence: breakdown.tokenConfidence,
      tokenSnapshotCount: breakdown.tokenSnapshotCount,
      estimatedCostUsd: undefined,
      messageCount: breakdown.messageCount,
      rawTokenTotal: breakdown.totalTokens || undefined,
      warnings: [...repo.warnings, ...breakdown.warnings],
      codexHome: options.codexHome ?? path.join(os.homedir(), ".codex"),
      durationMs: durationMs(breakdown.startedAt, breakdown.endedAt),
      rawEventCount: breakdown.rawEventCount,
      parseStatus: breakdown.parseStatus,
      parseErrors: breakdown.parseErrors,
      detectedSurface: surface.surface,
      surfaceConfidence: surface.confidence,
      surfaceReason: surface.reason,
      userPromptCount: breakdown.userPromptCount,
      assistantMessageCount: breakdown.assistantMessageCount,
      toolCallCount: breakdown.toolCallCount,
      shellCommandCount: breakdown.shellCommandCount,
      failedToolCallCount: breakdown.failedToolCallCount,
      nonZeroCommandEvents: breakdown.nonZeroCommandEvents,
      importantCommandFailures: breakdown.importantCommandFailures,
      harmlessNonZeroEvents: breakdown.harmlessNonZeroEvents,
      exploratoryMisses: breakdown.exploratoryMisses,
      repeatedFailureClusters: breakdown.repeatedFailureClusters,
      commandIssueSeverity: breakdown.commandIssueSeverity,
      commandIssueImpact: breakdown.commandIssueImpact,
      topFailureType: breakdown.topFailureType,
      commandIssueSamples: breakdown.commandIssueSamples,
      fileReadCount: breakdown.fileReadCount,
      fileEditCount: breakdown.fileEditCount,
      promptTimeline: breakdown.promptTimeline,
      sessionOutcome: inferOutcome(breakdown),
      compaction: breakdown.compaction,
    };
    const hasPricedBreakdown = breakdown.inputTokens + breakdown.cachedInputTokens + breakdown.outputTokens + breakdown.reasoningTokens > 0;
    const cost = hasPricedBreakdown ? calculateCostUsd(usage, options.pricing) : undefined;
    return {
      ...usage,
      estimatedCostUsd: cost,
      warnings: cost === undefined ? [...usage.warnings, hasPricedBreakdown ? "unknown_pricing" : "missing_token_breakdown"] : usage.warnings,
    };
  });
}

function hasImportedSession(sessions: NormalizedUsage[], candidate: NormalizedUsage): boolean {
  const candidatePath = comparableSourcePath(candidate.sourcePath);
  return sessions.some((session) => {
    if (session.id && session.id === candidate.id) return true;
    const sessionPath = comparableSourcePath(session.sourcePath);
    return Boolean(candidatePath && sessionPath && candidatePath === sessionPath);
  });
}

function remainingStandaloneSessionFiles(sessionFiles: Map<string, string>, importedSessions: NormalizedUsage[]): Map<string, string> {
  const importedIds = new Set(importedSessions.map((session) => session.id).filter(Boolean));
  const importedPaths = new Set(importedSessions.map((session) => comparableSourcePath(session.sourcePath)).filter(Boolean));
  return new Map([...sessionFiles.entries()].filter(([id, sourcePath]) => !importedIds.has(id) && !importedPaths.has(comparableSourcePath(sourcePath))));
}

function readImportedModelMap(codexHome: string, warnings: string[]): Map<string, ImportedModel> {
  const importsPath = path.join(codexHome, "external_agent_session_imports.json");
  const models = new Map<string, ImportedModel>();
  if (!fs.existsSync(importsPath)) return models;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(importsPath, "utf8"));
  } catch (error) {
    warnings.push(`Unable to read Codex external import index at ${importsPath}: ${errorMessage(error)}`);
    return models;
  }
  const records = Array.isArray(asRecord(parsed)?.records) ? asRecord(parsed)?.records as unknown[] : [];
  for (const record of records) {
    const item = asRecord(record);
    const importedThreadId = stringValue(item?.imported_thread_id);
    const sourcePath = normalizeVerbatimPath(stringValue(item?.source_path));
    if (!importedThreadId || !sourcePath || !fs.existsSync(sourcePath)) continue;
    const model = readImportedSourceModel(sourcePath, warnings);
    if (model) models.set(importedThreadId, { model, provider: providerForModel(model) });
  }
  return models;
}

function readImportedSourceModel(sourcePath: string, warnings: string[]): string | undefined {
  const counts = new Map<string, number>();
  let content: string;
  try {
    content = fs.readFileSync(sourcePath, "utf8");
  } catch (error) {
    warnings.push(`Unable to read Codex external import source at ${sourcePath}: ${errorMessage(error)}`);
    return undefined;
  }
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const model = modelFromImportedRecord(JSON.parse(line));
      if (model) counts.set(model, (counts.get(model) ?? 0) + 1);
    } catch (error) {
      warnings.push(`Unable to parse Codex external import source ${sourcePath} line ${index + 1}: ${errorMessage(error)}`);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

function modelFromImportedRecord(record: unknown): string | undefined {
  const object = asRecord(record);
  const type = stringValue(object?.type) ?? stringValue(asRecord(object?.payload)?.type);
  const message = asRecord(object?.message) ?? asRecord(asRecord(object?.payload)?.message);
  const model = stringValue(message?.model) ?? stringValue(object?.model);
  if (!model || model === "<synthetic>") return undefined;
  if (type && type !== "assistant") return undefined;
  return model;
}

function providerForModel(model: string): string | undefined {
  const normalized = model.toLowerCase();
  if (!normalized) return undefined;
  if (normalized.startsWith("claude")) return "anthropic";
  if (normalized.startsWith("gpt") || normalized.startsWith("o")) return "openai";
  return undefined;
}

function normalizeVerbatimPath(value: string | undefined): string | undefined {
  return value?.replace(/^\\\\\?\\/, "");
}

function comparableSourcePath(value: string | undefined): string | undefined {
  return normalizeVerbatimPath(value)?.replace(/\\/g, "/");
}

function indexSessionFiles(sessionsPath: string, warnings: string[], scanWindow?: SourceScanWindow): Map<string, string> {
  const files = new Map<string, string>();
  try {
    walk(sessionsPath, (filePath) => {
      if (!/\.(jsonl|json|log)$/i.test(filePath)) return;
      if (!fileMayOverlapScanWindow(filePath, scanWindow)) return;
      const id = path.basename(filePath).replace(/\.(jsonl|json|log)$/i, "");
      files.set(id, filePath);
    });
  } catch (error) {
    warnings.push(`Unable to read Codex sessions at ${sessionsPath}: ${errorMessage(error)}`);
  }
  return files;
}

function rowMatchesScanWindow(row: CodexThreadRow, scanWindow: SourceScanWindow | undefined): boolean {
  if (!scanWindow?.fromMs && !scanWindow?.toMs) return true;
  const updatedAt = timestampMs(row.updated_at);
  const createdAt = timestampMs(row.created_at);
  const latestTimestamp = updatedAt ?? createdAt;
  if (scanWindow.fromMs !== undefined && latestTimestamp !== undefined && latestTimestamp < scanWindow.fromMs) return false;
  if (scanWindow.toMs !== undefined && createdAt !== undefined && createdAt > scanWindow.toMs) return false;
  return true;
}

function fileMayOverlapScanWindow(filePath: string, scanWindow: SourceScanWindow | undefined): boolean {
  if (!scanWindow?.fromMs) return true;
  try {
    return fs.statSync(filePath).mtimeMs >= scanWindow.fromMs;
  } catch {
    return true;
  }
}

function walk(root: string, onFile: (path: string) => void): void {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, onFile);
    } else if (entry.isFile()) {
      onFile(fullPath);
    }
  }
}

function readSessionBreakdown(filePath: string): SessionTokenBreakdown {
  const cacheKey = sessionBreakdownCacheKey(filePath);
  const cached = cacheKey ? readJsonCache<SessionTokenBreakdown>("codex-session", cacheKey) : undefined;
  if (cached) return cached;

  const breakdown = emptyBreakdown();
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const parse = parseSessionRecords(text);
    const records = parse.records;
    breakdown.rawEventCount = records.length;
    breakdown.parseErrors = parse.errors;
    breakdown.parseStatus = parse.errors.length ? (records.length ? "partial" : "failed") : "ok";
    let eventMessageCount = 0;
    let responseMessageCount = 0;
    let lastUserMessageText: string | undefined;
    for (const record of records) {
      applySessionBounds(breakdown, record);
      applySessionMetadata(breakdown, record);
      applyPromptTimeline(breakdown, record);
      if (isCodexEventMessage(record)) eventMessageCount += 1;
      if (isResponseMessage(record)) responseMessageCount += 1;
      const userText = extractUserMessageText(record);
      if (userText !== undefined) lastUserMessageText = userText;
      applyCompactionEvent(breakdown, record, lastUserMessageText);
    }
    breakdown.messageCount = eventMessageCount || responseMessageCount;
    const tokenAggregation = aggregateTokens(records);
    Object.assign(breakdown, {
      ...tokenAggregation,
      warnings: [...breakdown.warnings, ...tokenAggregation.warnings],
    });
    Object.assign(breakdown, analyzeAgentFriction(records, breakdown.totalTokens));
  } catch (error) {
    const message = `unable_to_read_session_file:${errorMessage(error)}`;
    breakdown.parseStatus = "failed";
    breakdown.parseErrors.push(message);
    breakdown.warnings.push(message);
  }
  if (cacheKey) writeJsonCache("codex-session", cacheKey, breakdown);
  return breakdown;
}

function sessionBreakdownCacheKey(filePath: string): { version: string; filePath: string; size: number; mtimeMs: number } | undefined {
  try {
    const stat = fs.statSync(filePath);
    return {
      version: codexSessionCacheVersion,
      filePath: path.resolve(filePath),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  } catch {
    return undefined;
  }
}

function parseSessionRecords(text: string): { records: unknown[]; errors: string[] } {
  const trimmed = text.trim();
  if (!trimmed) return { records: [], errors: [] };
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      return { records: Array.isArray(parsed) ? parsed : [parsed], errors: [] };
    } catch {
      return parseJsonLines(text);
    }
  }
  return parseJsonLines(text);
}

function parseJsonLines(text: string, firstError?: string): { records: unknown[]; errors: string[] } {
  const records: unknown[] = [];
  const errors: string[] = firstError ? [`json_parse:${firstError}`] : [];
  text
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => Boolean(line))
    .forEach(({ line, index }) => {
      try {
        records.push(JSON.parse(line));
      } catch (error) {
        errors.push(`jsonl_line_${index + 1}:${errorMessage(error)}`);
      }
    });
  return { records, errors };
}

function firstObject(...values: unknown[]): Record<string, unknown> | undefined {
  return values.find((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value));
}

function numberFromKeys(object: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function parseTokenTotal(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "number") return parsed;
      if (parsed && typeof parsed === "object") {
        return numberFromKeys(parsed as Record<string, unknown>, ["total_tokens", "totalTokens", "tokens_used", "tokensUsed"]);
      }
    } catch {
      return 0;
    }
  }
  return 0;
}

function matchSessionPath(id: string | undefined, sessionFiles: Map<string, string>): string | undefined {
  if (!id) return undefined;
  return sessionFiles.get(id) ?? [...sessionFiles.entries()].find(([key]) => key.includes(id) || id.includes(key))?.[1];
}

function emptyBreakdown(): SessionTokenBreakdown {
  return {
    id: undefined,
    cwd: undefined,
    title: undefined,
    startedAt: undefined,
    endedAt: undefined,
    model: undefined,
    provider: undefined,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    tokenAggregationMethod: "unknown",
    tokenConfidence: "low",
    tokenSnapshotCount: 0,
    warnings: [],
    messageCount: 0,
    source: undefined,
    originator: undefined,
    threadSource: undefined,
    rawEventCount: 0,
    parseStatus: "ok",
    parseErrors: [],
    userPromptCount: 0,
    assistantMessageCount: 0,
    toolCallCount: 0,
    shellCommandCount: 0,
    failedToolCallCount: 0,
    commandIssues: [],
    nonZeroCommandEvents: 0,
    importantCommandFailures: 0,
    harmlessNonZeroEvents: 0,
    exploratoryMisses: 0,
    repeatedFailureClusters: 0,
    commandIssueSeverity: "none",
    commandIssueImpact: "none",
    topFailureType: undefined,
    commandIssueSamples: [],
    fileReadCount: 0,
    fileEditCount: 0,
    promptTimeline: [],
    compaction: { count: 0, autoCount: 0, manualCount: 0, events: [] },
  };
}

function fallbackCwdFromPath(filePath: string): string {
  return filePath ? path.dirname(filePath) : process.cwd();
}

function applySessionMetadata(breakdown: SessionTokenBreakdown, record: unknown): void {
  if (!record || typeof record !== "object") return;
  const object = record as Record<string, unknown>;
  const payload = firstObject(object.payload) ?? object;
  const collaborationMode = firstObject(payload.collaboration_mode);
  const collaborationSettings = firstObject(collaborationMode?.settings);
  breakdown.id ??= stringValue(payload.id);
  breakdown.cwd ??= stringValue(payload.cwd);
  breakdown.title ??= stringValue(payload.title);
  breakdown.model ??= stringValue(payload.model) ?? stringValue(collaborationSettings?.model);
  breakdown.provider ??= stringValue(payload.model_provider);
  breakdown.source ??= stringValue(payload.source);
  breakdown.originator ??= stringValue(payload.originator);
  breakdown.threadSource ??= stringValue(payload.thread_source);
}

function applySessionBounds(breakdown: SessionTokenBreakdown, record: unknown): void {
  if (!record || typeof record !== "object") return;
  const object = record as Record<string, unknown>;
  const payload = firstObject(object.payload);
  const timestamp = dateValue(object.timestamp) ?? dateValue(payload?.timestamp);
  const sessionStartedAt = object.type === "session_meta" ? dateValue(payload?.timestamp) ?? timestamp : timestamp;
  if (sessionStartedAt && (!breakdown.startedAt || sessionStartedAt < breakdown.startedAt)) breakdown.startedAt = sessionStartedAt;
  if (timestamp && (!breakdown.endedAt || timestamp > breakdown.endedAt)) breakdown.endedAt = timestamp;
}

function isCodexEventMessage(record: unknown): boolean {
  if (!record || typeof record !== "object") return false;
  const object = record as Record<string, unknown>;
  if (object.type !== "event_msg") return false;
  const payload = firstObject(object.payload);
  return payload?.type === "user_message" || payload?.type === "agent_message";
}

function isResponseMessage(record: unknown): boolean {
  if (!record || typeof record !== "object") return false;
  const object = record as Record<string, unknown>;
  if (object.type !== "response_item") return false;
  const payload = firstObject(object.payload);
  return payload?.type === "message" && (payload.role === "user" || payload.role === "assistant");
}

function extractUserMessageText(record: unknown): string | undefined {
  if (!record || typeof record !== "object") return undefined;
  const object = record as Record<string, unknown>;
  const payload = firstObject(object.payload) ?? object;
  const payloadType = stringValue(payload.type);
  const roleValue = stringValue(payload.role);
  const isUser =
    payloadType === "user_message" ||
    (object.type === "response_item" && payloadType === "message" && roleValue === "user");
  if (!isUser) return undefined;
  return extractMessageText(payload) ?? extractMessageText(object);
}

function applyCompactionEvent(breakdown: SessionTokenBreakdown, record: unknown, lastUserMessageText: string | undefined): void {
  if (!record || typeof record !== "object") return;
  const object = record as Record<string, unknown>;
  if (object.type !== "event_msg") return;
  const payload = firstObject(object.payload);
  if (payload?.type !== "context_compacted") return;
  const trigger: "manual" | "auto" = isManualCompactCommand(lastUserMessageText) ? "manual" : "auto";
  breakdown.compaction.count += 1;
  if (trigger === "manual") breakdown.compaction.manualCount += 1;
  else breakdown.compaction.autoCount += 1;
  breakdown.compaction.events.push({
    timestamp: dateValue(object.timestamp) ?? dateValue(payload.timestamp),
    trigger,
  });
}

function isManualCompactCommand(text: string | undefined): boolean {
  if (!text) return false;
  // User typed `/compact` (optionally followed by an instruction). Codex passes the slash command through as a normal user message.
  return /^\s*\/compact\b/.test(text);
}

function applyPromptTimeline(breakdown: SessionTokenBreakdown, record: unknown): void {
  if (breakdown.promptTimeline.length >= 80 || !record || typeof record !== "object") return;
  const object = record as Record<string, unknown>;
  const payload = firstObject(object.payload) ?? object;
  const payloadType = stringValue(payload.type);
  const roleValue = stringValue(payload.role);
  const role: PromptTimelineItem["role"] | undefined =
    payloadType === "user_message" || roleValue === "user"
      ? "user"
      : payloadType === "agent_message" || roleValue === "assistant"
        ? "assistant"
        : undefined;
  if (!role) return;
  const text = extractMessageText(payload) ?? extractMessageText(object);
  if (!text) return;
  const timelineText = compactTimelineText(text);
  if (!timelineText || isCodexStartupContext(timelineText)) return;
  const item = {
    role,
    text: normalizeTimelineText(timelineText),
    timestamp: dateValue(payload.timestamp) ?? dateValue(object.timestamp) ?? dateValue(payload.created_at) ?? dateValue(object.created_at),
  };
  if (hasNearbyDuplicatePromptTimelineItem(breakdown.promptTimeline, item)) return;
  breakdown.promptTimeline.push(item);
}

function extractMessageText(record: Record<string, unknown>): string | undefined {
  for (const key of ["text", "message", "content", "input"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value)) {
      const parts = value
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") {
            const object = item as Record<string, unknown>;
            return stringValue(object.text) ?? stringValue(object.content);
          }
          return undefined;
        })
        .filter((item): item is string => Boolean(item?.trim()));
      if (parts.length) return parts.join("\n");
    }
  }
  return undefined;
}

function compactTimelineText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeTimelineText(text: string): string {
  return compactTimelineText(text).slice(0, 1000);
}

function isCodexStartupContext(text: string): boolean {
  return text.includes("<environment_context>") && (text.includes("# AGENTS.md instructions") || text.includes("<INSTRUCTIONS>"));
}

function hasNearbyDuplicatePromptTimelineItem(items: PromptTimelineItem[], item: PromptTimelineItem): boolean {
  return items.some((existing) => {
    if (existing.role !== item.role || existing.text !== item.text) return false;
    if (!existing.timestamp || !item.timestamp) return true;
    const existingTime = new Date(existing.timestamp).getTime();
    const itemTime = new Date(item.timestamp).getTime();
    if (!Number.isFinite(existingTime) || !Number.isFinite(itemTime)) return false;
    return Math.abs(existingTime - itemTime) <= 5_000;
  });
}

function codexSourceRaw(source: string | undefined, sessionSource: string | undefined, originator: string | undefined, threadSource: string | undefined): string | undefined {
  if (originator && /codex\s+desktop/i.test(originator)) return originator;
  return source ?? sessionSource ?? originator ?? threadSource;
}

function detectSurface(source: string | undefined, threadSource: string | undefined): { surface: NormalizedUsage["detectedSurface"]; confidence: NormalizedUsage["surfaceConfidence"]; reason: string } {
  const raw = `${source ?? ""} ${threadSource ?? ""}`.toLowerCase();
  if (threadSource === "subagent") return { surface: "codex_exec", confidence: "medium", reason: "thread_source is subagent" };
  if (raw.includes("codex desktop")) return { surface: "local_agent", confidence: "high", reason: "originator metadata identifies Codex Desktop" };
  if (raw.includes("vscode")) return { surface: "vscode_extension", confidence: "high", reason: "source metadata includes vscode" };
  if (raw.includes("cli") || raw.includes("terminal") || raw.includes("tui")) return { surface: "terminal_cli", confidence: "high", reason: "source metadata indicates CLI/terminal" };
  if (raw.includes("exec")) return { surface: "codex_exec", confidence: "medium", reason: "source metadata includes exec" };
  if (raw.includes("codex_app") || raw.includes("codex-app")) return { surface: "codex_app_cloud", confidence: "low", reason: "source metadata references codex app; local logs may be incomplete" };
  return { surface: "unknown", confidence: "low", reason: "no recognized local surface metadata" };
}

function inferOutcome(breakdown: SessionTokenBreakdown): NormalizedUsage["sessionOutcome"] {
  if (breakdown.parseStatus === "failed") return "failed";
  if (breakdown.failedToolCallCount > 0) return "partial";
  if (breakdown.fileEditCount > 0) return "completed";
  if (breakdown.shellCommandCount > 0) return "setup_debugging";
  if (breakdown.userPromptCount > 0 || breakdown.assistantMessageCount > 0) return "research_only";
  return "unknown";
}

function durationMs(startedAt: string | undefined, endedAt: string | undefined): number | undefined {
  if (!startedAt || !endedAt) return undefined;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function codexSourceAppLabel(source: string | undefined, threadSource: string | undefined): string {
  if (threadSource === "subagent") return "Codex subagent";
  if (!source) return "Codex";
  if (/codex\s+desktop/i.test(source)) return "Codex Desktop";
  if (source === "vscode" || source === "codex_vscode" || source === "codex-vscode") return "VS Code";
  if (source === "cli" || source === "terminal" || source === "codex-tui") return "Terminal";
  if (source === "codex_app" || source === "codex-app") return "Codex app";
  if (source.trim().startsWith("{")) return threadSource === "subagent" ? "Codex subagent" : "Codex";
  return source
    .replace(/^codex[_-]/, "")
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dateValue(value: unknown): string | undefined {
  if (typeof value === "number") {
    return new Date(value > 10_000_000_000 ? value : value * 1000).toISOString();
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return undefined;
}

function timestampMs(value: unknown): number | undefined {
  const date = dateValue(value);
  if (!date) return undefined;
  const timestamp = new Date(date).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("NODE_MODULE_VERSION") && message.includes("better_sqlite3.node")) {
    const builtAbi = message.match(/NODE_MODULE_VERSION\s+(\d+)/)?.[1] ?? "unknown";
    const requiredAbi = message.match(/requires\s+NODE_MODULE_VERSION\s+(\d+)/)?.[1] ?? "unknown";
    return `SQLite native module mismatch: better-sqlite3 was built for Node ABI ${builtAbi}, but RepoSpend is running with ABI ${requiredAbi}. Run "node -p \\"process.version + ' ABI=' + process.versions.modules\\"" in the same terminal you use for RepoSpend, then reinstall or rebuild better-sqlite3 with that same Node version. From source, run "pnpm rebuild:native". For a global npm install, run "npm rebuild -g better-sqlite3" or reinstall RepoSpend.`;
  }
  return message;
}
