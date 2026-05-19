import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { CommandCategory, CommandIssueClassification, CommandIssueImpact, CommandIssueSample, CommandIssueSeverity, NormalizedUsage, PromptTimelineItem, RepoSpendConfig, SourceStatus } from "@repospend/types";
import { calculateCostUsd, type PricingTable } from "../pricing.js";
import { resolveRepoInfo } from "../repo.js";
import { analyzeAgentFriction, type CommandIssue } from "./agent-friction.js";
import { aggregateTokens, type CodexTokenAggregation } from "./codex-token.js";

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

interface SessionTokenBreakdown extends CodexTokenAggregation {
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
  warnings: string[];
}

export interface CodexAdapterOptions {
  codexHome?: string;
  config?: RepoSpendConfig;
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

  const sessionFiles = sessionsExists ? indexSessionFiles(sessionsPath, warnings) : new Map<string, string>();
  if (stateExists) {
    const stateSessions = readThreads(statePath, sessionFiles, options, warnings);
    sessions.push(...stateSessions);
    if (!stateSessions.length && sessionsExists) {
      sessions.push(...readStandaloneSessions(sessionFiles, options));
    }
  }

  if (!stateExists && sessionsExists) {
    sessions.push(...readStandaloneSessions(sessionFiles, options));
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
    db = new Database(statePath, { readonly: true, fileMustExist: true });
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

    const rows = db.prepare(`SELECT ${selectedColumns.map((column) => `"${column}"`).join(", ")} FROM threads`).all() as CodexThreadRow[];
    return rows.map((row, index) => threadToUsage(row, index, sessionFiles, options));
  } catch (error) {
    warnings.push(`Unable to read Codex SQLite state at ${statePath}: ${errorMessage(error)}`);
    return [];
  } finally {
    db?.close();
  }
}

function threadToUsage(row: CodexThreadRow, index: number, sessionFiles: Map<string, string>, options: CodexAdapterOptions): NormalizedUsage {
  const sourcePath = stringValue(row.rollout_path) ?? matchSessionPath(stringValue(row.id), sessionFiles) ?? "";
  const sessionBreakdown = sourcePath ? readSessionBreakdown(sourcePath) : emptyBreakdown();
  const dbTokens = parseTokenTotal(row.tokens_used);
  const cwd = stringValue(row.cwd) ?? fallbackCwdFromPath(sourcePath);
  const repo = resolveRepoInfo(cwd, options.config);
  const inputTokens = sessionBreakdown.inputTokens;
  const cachedInputTokens = sessionBreakdown.cachedInputTokens;
  const outputTokens = sessionBreakdown.outputTokens;
  const reasoningTokens = sessionBreakdown.reasoningTokens;
  const totalTokens = sessionBreakdown.totalTokens || dbTokens || inputTokens + outputTokens + reasoningTokens;
  const hasPricedBreakdown = inputTokens + cachedInputTokens + outputTokens + reasoningTokens > 0;
  const warnings = [...repo.warnings, ...sessionBreakdown.warnings];
  const threadSource = stringValue(row.thread_source) ?? sessionBreakdown.threadSource;
  const sourceAppRaw = stringValue(row.source) ?? sessionBreakdown.source ?? sessionBreakdown.originator ?? threadSource;
  const surface = detectSurface(sourceAppRaw, threadSource);
  const usage: NormalizedUsage = {
    id: stringValue(row.id) ?? `codex-thread-${index}`,
    sourceClient: "codex",
    sourceApp: codexSourceAppLabel(sourceAppRaw, threadSource),
    sourceAppRaw,
    sourcePath,
    repoRoot: repo.repoRoot,
    repoName: repo.repoName,
    cwd,
    gitRemoteUrl: repo.gitRemoteUrl,
    gitBranch: repo.gitBranch,
    title: stringValue(row.title),
    startedAt: dateValue(row.created_at),
    endedAt: dateValue(row.updated_at),
    model: stringValue(row.model),
    provider: stringValue(row.model_provider),
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
    durationMs: durationMs(dateValue(row.created_at), dateValue(row.updated_at)),
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
    const cwd = fallbackCwdFromPath(sourcePath);
    const repo = resolveRepoInfo(cwd, options.config);
    const model = undefined;
    const surface = detectSurface(breakdown.source ?? breakdown.originator, breakdown.threadSource);
    return {
      id,
      sourceClient: "codex",
      sourceApp: codexSourceAppLabel(breakdown.source ?? breakdown.originator, breakdown.threadSource),
      sourceAppRaw: breakdown.source ?? breakdown.originator ?? breakdown.threadSource,
      sourcePath,
      repoRoot: repo.repoRoot,
      repoName: repo.repoName,
      cwd,
      gitRemoteUrl: repo.gitRemoteUrl,
      gitBranch: repo.gitBranch,
      title: undefined,
      startedAt: undefined,
      endedAt: undefined,
      model,
      provider: undefined,
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
      warnings: [...repo.warnings, ...breakdown.warnings, "unknown_pricing"],
      codexHome: options.codexHome ?? path.join(os.homedir(), ".codex"),
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
    };
  });
}

function indexSessionFiles(sessionsPath: string, warnings: string[]): Map<string, string> {
  const files = new Map<string, string>();
  try {
    walk(sessionsPath, (filePath) => {
      if (!/\.(jsonl|json|log)$/i.test(filePath)) return;
      const id = path.basename(filePath).replace(/\.(jsonl|json|log)$/i, "");
      files.set(id, filePath);
    });
  } catch (error) {
    warnings.push(`Unable to read Codex sessions at ${sessionsPath}: ${errorMessage(error)}`);
  }
  return files;
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
    for (const record of records) {
      applySessionMetadata(breakdown, record);
      applyPromptTimeline(breakdown, record);
      if (isCodexEventMessage(record)) eventMessageCount += 1;
      if (isResponseMessage(record)) responseMessageCount += 1;
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
  return breakdown;
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
  };
}

function fallbackCwdFromPath(filePath: string): string {
  return filePath ? path.dirname(filePath) : process.cwd();
}

function applySessionMetadata(breakdown: SessionTokenBreakdown, record: unknown): void {
  if (!record || typeof record !== "object") return;
  const object = record as Record<string, unknown>;
  const payload = firstObject(object.payload) ?? object;
  breakdown.source ??= stringValue(payload.source);
  breakdown.originator ??= stringValue(payload.originator);
  breakdown.threadSource ??= stringValue(payload.thread_source);
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
  breakdown.promptTimeline.push({
    role,
    text: normalizeTimelineText(text),
    timestamp: dateValue(payload.timestamp) ?? dateValue(object.timestamp) ?? dateValue(payload.created_at) ?? dateValue(object.created_at),
  });
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

function normalizeTimelineText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 1000);
}

function detectSurface(source: string | undefined, threadSource: string | undefined): { surface: NormalizedUsage["detectedSurface"]; confidence: NormalizedUsage["surfaceConfidence"]; reason: string } {
  const raw = `${source ?? ""} ${threadSource ?? ""}`.toLowerCase();
  if (threadSource === "subagent") return { surface: "codex_exec", confidence: "medium", reason: "thread_source is subagent" };
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

function codexSourceAppLabel(source: string | undefined, threadSource: string | undefined): string {
  if (threadSource === "subagent") return "Codex app";
  if (!source) return "Codex";
  if (source === "vscode" || source === "codex_vscode" || source === "codex-vscode") return "VS Code";
  if (source === "cli" || source === "terminal" || source === "codex-tui") return "Terminal";
  if (source === "codex_app" || source === "codex-app") return "Codex app";
  if (source.trim().startsWith("{")) return threadSource === "subagent" ? "Codex app" : "Codex";
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

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("NODE_MODULE_VERSION") && message.includes("better_sqlite3.node")) {
    const builtAbi = message.match(/NODE_MODULE_VERSION\s+(\d+)/)?.[1] ?? "unknown";
    const requiredAbi = message.match(/requires\s+NODE_MODULE_VERSION\s+(\d+)/)?.[1] ?? "unknown";
    return `SQLite native module mismatch: better-sqlite3 was built for Node ABI ${builtAbi}, but RepoSpend is running with ABI ${requiredAbi}. Run "node -p \\"process.version + ' ABI=' + process.versions.modules\\"" in the same terminal you use for RepoSpend, then reinstall or rebuild better-sqlite3 with that same Node version. From source, run "pnpm rebuild:native". For a global npm install, run "npm rebuild -g better-sqlite3" or reinstall RepoSpend.`;
  }
  return message;
}
