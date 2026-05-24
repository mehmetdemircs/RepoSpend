import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NormalizedUsage, PromptTimelineItem, RepoSpendConfig, SourceStatus } from "@repospend/types";
import { calculateCostUsd, type PricingTable } from "../pricing.js";
import { resolveRepoInfo } from "../repo.js";
import type { SourceScanWindow } from "./index.js";

interface ClaudeRecord {
  type?: unknown;
  timestamp?: unknown;
  cwd?: unknown;
  gitBranch?: unknown;
  entrypoint?: unknown;
  sessionId?: unknown;
  uuid?: unknown;
  parentUuid?: unknown;
  aiTitle?: unknown;
  message?: unknown;
  toolUseResult?: unknown;
  version?: unknown;
  isSidechain?: unknown;
  requestId?: unknown;
}

interface ClaudeTokenTotals {
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  usageCount: number;
}

interface ClaudeUsageEvent {
  timestamp: string | undefined;
  model: string | undefined;
  usage: Record<string, unknown>;
}

interface ClaudeSessionBreakdown extends ClaudeTokenTotals {
  id: string | undefined;
  title: string | undefined;
  cwd: string | undefined;
  gitBranch: string | undefined;
  entrypoint: string | undefined;
  version: string | undefined;
  startedAt: string | undefined;
  endedAt: string | undefined;
  model: string | undefined;
  messageCount: number;
  userPromptCount: number;
  assistantMessageCount: number;
  toolCallCount: number;
  shellCommandCount: number;
  failedToolCallCount: number;
  fileReadCount: number;
  fileEditCount: number;
  rawEventCount: number;
  parseStatus: "ok" | "partial" | "failed";
  parseErrors: string[];
  promptTimeline: PromptTimelineItem[];
  warnings: string[];
  usageEvents: ClaudeUsageEvent[];
}

export interface ClaudeAdapterOptions {
  claudeHome?: string;
  config?: RepoSpendConfig;
  scanWindow?: SourceScanWindow;
  pricing: PricingTable;
}

export interface ClaudeScanResult {
  source: SourceStatus;
  sessions: NormalizedUsage[];
  stats: ClaudeScanStats;
}

export interface ClaudeScanStats {
  sourceId: "claude";
  sourceLabel: "Claude Code";
  homePath: string;
  claudeHome: string;
  projectsPath: string;
  historyPath: string;
  projectsExists: boolean;
  historyExists: boolean;
  sessionFileCount: number;
  projectDirCount: number;
  sessionsImported: number;
  parseFailureCount: number;
  unreadableFileCount: number;
  malformedFileCount: number;
  historyEntryCount: number;
  lastScannedAt: string;
}

interface ClaudeSessionFile {
  filePath: string;
  projectDir: string;
  projectsPath: string;
}

interface ClaudeUsageSelection {
  usageByOccurrence: Map<string, Record<string, unknown>>;
}

export function scanClaude(options: ClaudeAdapterOptions): ClaudeScanResult {
  const claudeHome = options.claudeHome ?? defaultClaudeHome();
  const historyPath = path.join(claudeHome, "history.jsonl");
  const warnings: string[] = [];
  const discovery = discoverClaudeSessionFiles(claudeHome, warnings, Boolean(options.claudeHome));
  const historyExists = fs.existsSync(historyPath);
  const orderedFiles = discovery.files
    .map((file) => ({ file, mtimeMs: safeMtimeMs(file.filePath) }))
    .filter(({ mtimeMs }) => !options.scanWindow?.fromMs || mtimeMs >= options.scanWindow.fromMs)
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
  const usageSelection = selectClaudeUsageOccurrences(orderedFiles.map(({ file }) => file));
  const sessions = orderedFiles.flatMap(({ file }, index) => claudeFileToUsages(file, index, options, usageSelection));
  const historyEntryCount = countHistoryEntries(historyPath);
  const parseFailureCount = sessions.filter((session) => session.parseStatus === "failed" || (session.parseErrors?.length ?? 0) > 0).length;
  const unreadableFileCount = sessions.filter((session) => session.parseErrors?.some((error) => error.startsWith("unable_to_read_session_file:"))).length;
  const malformedFileCount = sessions.filter((session) => session.parseErrors?.some((error) => error.startsWith("jsonl_line_"))).length;
  const projectsPath = path.join(claudeHome, "projects");

  if (!discovery.projectsPaths.some((candidate) => fs.existsSync(candidate))) {
    warnings.push(`Claude Code projects directory not found at ${projectsPath}`);
  }

  return {
    source: {
      id: "claude",
      label: "Claude Code",
      available: discovery.files.length > 0 || historyExists,
      paths: unique([...discovery.projectsPaths, historyPath, ...discovery.desktopSessionRoots]),
      warnings,
    },
    sessions,
    stats: {
      sourceId: "claude",
      sourceLabel: "Claude Code",
      homePath: claudeHome,
      claudeHome,
      projectsPath,
      historyPath,
      projectsExists: discovery.projectsPaths.some((candidate) => fs.existsSync(candidate)),
      historyExists,
      sessionFileCount: discovery.files.length,
      projectDirCount: discovery.projectDirs.size,
      sessionsImported: sessions.length,
      parseFailureCount,
      unreadableFileCount,
      malformedFileCount,
      historyEntryCount,
      lastScannedAt: new Date().toISOString(),
    },
  };
}

function discoverClaudeSessionFiles(claudeHome: string, warnings: string[], explicitHome: boolean): { files: ClaudeSessionFile[]; projectDirs: Set<string>; projectsPaths: string[]; desktopSessionRoots: string[] } {
  const files: ClaudeSessionFile[] = [];
  const projectDirs = new Set<string>();
  const projectsPaths = explicitHome
    ? [path.join(claudeHome, "projects")]
    : unique([...configuredClaudeHomes(claudeHome).map((root) => path.join(root, "projects")), path.join(os.homedir(), ".config", "claude", "projects")]);
  for (const projectsPath of projectsPaths) {
    collectProjectFiles(projectsPath, files, projectDirs, warnings);
  }

  const desktopSessionRoots = explicitHome ? [] : defaultDesktopSessionRoots();
  for (const root of desktopSessionRoots) {
    collectDesktopSessionFiles(root, files, projectDirs, warnings);
  }

  return {
    files: uniqueSessionFiles(files),
    projectDirs,
    projectsPaths,
    desktopSessionRoots,
  };
}

function configuredClaudeHomes(primaryHome: string): string[] {
  if (process.env.CLAUDE_CONFIG_DIR) {
    return process.env.CLAUDE_CONFIG_DIR.split(",").map((item) => item.trim()).filter(Boolean).map((item) => path.resolve(item));
  }
  return [primaryHome];
}

function collectProjectFiles(projectsPath: string, files: ClaudeSessionFile[], projectDirs: Set<string>, warnings: string[]): void {
  if (!fs.existsSync(projectsPath)) return;
  try {
    for (const entry of fs.readdirSync(projectsPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const projectDir = path.join(projectsPath, entry.name);
      projectDirs.add(projectDir);
      walk(projectDir, 5, (filePath) => {
        if (filePath.endsWith(".jsonl")) files.push({ filePath, projectDir, projectsPath });
      });
    }
  } catch (error) {
    warnings.push(`Unable to read Claude Code projects at ${projectsPath}: ${errorMessage(error)}`);
  }
}

function collectDesktopSessionFiles(root: string, files: ClaudeSessionFile[], projectDirs: Set<string>, warnings: string[]): void {
  if (!fs.existsSync(root)) return;
  try {
    walk(root, 8, (filePath) => {
      if (!filePath.endsWith(".jsonl")) return;
      const parts = filePath.split(path.sep);
      const projectsIndex = parts.lastIndexOf("projects");
      const hasProjectSegment = projectsIndex >= 0 && projectsIndex < parts.length - 2;
      const projectsPath = hasProjectSegment ? parts.slice(0, projectsIndex + 1).join(path.sep) || path.sep : root;
      const projectDir = hasProjectSegment ? parts.slice(0, projectsIndex + 2).join(path.sep) || path.sep : path.dirname(filePath);
      projectDirs.add(projectDir);
      files.push({ filePath, projectDir, projectsPath });
    });
  } catch (error) {
    warnings.push(`Unable to read Claude Code desktop sessions at ${root}: ${errorMessage(error)}`);
  }
}

function walk(root: string, maxDepth: number, onFile: (path: string) => void, depth = 0): void {
  if (depth > maxDepth) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, maxDepth, onFile, depth + 1);
    } else if (entry.isFile()) {
      onFile(fullPath);
    }
  }
}

function claudeFileToUsages(file: ClaudeSessionFile, index: number, options: ClaudeAdapterOptions, usageSelection: ClaudeUsageSelection): NormalizedUsage[] {
  const breakdown = readClaudeBreakdown(file.filePath, usageSelection);
  const segments = segmentClaudeBreakdownByDayAndModel(breakdown);
  return segments.map(({ breakdown: segment, suffix }) => claudeBreakdownToUsage(file, index, options, segment, suffix));
}

function claudeBreakdownToUsage(file: ClaudeSessionFile, index: number, options: ClaudeAdapterOptions, breakdown: ClaudeSessionBreakdown, idSuffix = ""): NormalizedUsage {
  const id = breakdown.id ?? (path.basename(file.filePath).replace(/\.jsonl$/i, "") || `claude-session-${index}`);
  const fallbackCwd = inferProjectPath(file.projectDir, file.projectsPath);
  const cwd = breakdown.cwd ?? fallbackCwd;
  const repo = resolveRepoInfo(cwd, options.config);
  const warnings = [...repo.warnings, ...breakdown.warnings];
  const entrypoint = breakdown.entrypoint ?? inferClaudeEntrypointFromPath(file.filePath);
  if (!breakdown.cwd) warnings.push("repo_inferred_from_claude_project_dir");
  const hasTokenBreakdown = breakdown.totalTokens > 0 && breakdown.usageCount > 0;
  const usage: NormalizedUsage = {
    id: `${id}${idSuffix}`,
    sourceClient: "claude",
    sourceApp: claudeSourceAppLabel(entrypoint),
    sourceAppRaw: entrypoint,
    sourcePath: file.filePath,
    repoRoot: repo.repoRoot,
    repoName: repo.repoName,
    cwd,
    gitRemoteUrl: repo.gitRemoteUrl,
    gitBranch: repo.gitBranch ?? breakdown.gitBranch,
    title: breakdown.title,
    startedAt: breakdown.startedAt,
    endedAt: breakdown.endedAt,
    model: breakdown.model,
    provider: "anthropic",
    inputTokens: breakdown.inputTokens,
    cachedInputTokens: breakdown.cachedInputTokens,
    cacheCreationInputTokens: breakdown.cacheCreationInputTokens,
    outputTokens: breakdown.outputTokens,
    reasoningTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: breakdown.totalTokens,
    tokenAggregationMethod: hasTokenBreakdown ? "direct_usage" : "unknown",
    tokenConfidence: hasTokenBreakdown ? "high" : "low",
    tokenSnapshotCount: breakdown.usageCount,
    estimatedCostUsd: undefined,
    messageCount: breakdown.messageCount,
    rawTokenTotal: hasTokenBreakdown ? breakdown.totalTokens : undefined,
    warnings: hasTokenBreakdown ? warnings : [...warnings, "missing_token_breakdown"],
    durationMs: durationMs(breakdown.startedAt, breakdown.endedAt),
    rawEventCount: breakdown.rawEventCount,
    parseStatus: breakdown.parseStatus,
    parseErrors: breakdown.parseErrors,
    detectedSurface: claudeSurface(entrypoint),
    surfaceConfidence: "medium",
    surfaceReason: entrypoint ? `Claude Code entrypoint: ${entrypoint}` : "Claude Code transcript",
    userPromptCount: breakdown.userPromptCount,
    assistantMessageCount: breakdown.assistantMessageCount,
    toolCallCount: breakdown.toolCallCount,
    shellCommandCount: breakdown.shellCommandCount,
    failedToolCallCount: breakdown.failedToolCallCount,
    nonZeroCommandEvents: 0,
    importantCommandFailures: 0,
    harmlessNonZeroEvents: 0,
    exploratoryMisses: 0,
    repeatedFailureClusters: 0,
    commandIssueSeverity: breakdown.failedToolCallCount > 0 ? "warning" : "none",
    commandIssueImpact: breakdown.failedToolCallCount > 0 ? "medium" : "none",
    topFailureType: breakdown.failedToolCallCount > 0 ? "unknown" : undefined,
    commandIssueSamples: [],
    fileReadCount: breakdown.fileReadCount,
    fileEditCount: breakdown.fileEditCount,
    promptTimeline: breakdown.promptTimeline,
    sessionOutcome: inferOutcome(breakdown),
  };
  const cost = hasTokenBreakdown ? calculateCostUsd(usage, options.pricing) : undefined;
  return {
    ...usage,
    estimatedCostUsd: cost,
    warnings: cost === undefined ? [...usage.warnings, "unknown_pricing"] : usage.warnings,
  };
}

function inferClaudeEntrypointFromPath(filePath: string): string | undefined {
  return filePath.split(path.sep).includes("local-agent-mode-sessions") ? "local-agent" : undefined;
}

function readClaudeBreakdown(filePath: string, usageSelection: ClaudeUsageSelection): ClaudeSessionBreakdown {
  const breakdown = emptyBreakdown();
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const parse = parseJsonLines(text);
    breakdown.rawEventCount = parse.records.length;
    breakdown.parseErrors = parse.errors;
    breakdown.parseStatus = parse.errors.length ? (parse.records.length ? "partial" : "failed") : "ok";
    for (const [recordIndex, record] of parse.records.entries()) {
      applyClaudeRecord(breakdown, record, usageSelection, occurrenceKey(filePath, recordIndex));
    }
    breakdown.totalTokens = breakdown.inputTokens + breakdown.outputTokens;
  } catch (error) {
    const message = `unable_to_read_session_file:${errorMessage(error)}`;
    breakdown.parseStatus = "failed";
    breakdown.parseErrors.push(message);
    breakdown.warnings.push(message);
  }
  return breakdown;
}

function applyClaudeRecord(breakdown: ClaudeSessionBreakdown, record: ClaudeRecord, usageSelection: ClaudeUsageSelection, usageOccurrenceKey: string): void {
  const timestamp = dateValue(record.timestamp);
  if (timestamp) {
    breakdown.startedAt = minDate(breakdown.startedAt, timestamp);
    breakdown.endedAt = maxDate(breakdown.endedAt, timestamp);
  }
  breakdown.id ??= stringValue(record.sessionId);
  breakdown.cwd ??= stringValue(record.cwd);
  breakdown.gitBranch ??= stringValue(record.gitBranch);
  breakdown.entrypoint ??= stringValue(record.entrypoint);
  breakdown.version ??= stringValue(record.version);
  breakdown.title ??= stringValue(record.aiTitle);

  const message = firstObject(record.message);
  const role = stringValue(message?.role) ?? stringValue(record.type);
  if (role === "user") breakdown.userPromptCount += 1;
  if (role === "assistant") breakdown.assistantMessageCount += 1;
  if (role === "user" || role === "assistant") breakdown.messageCount += 1;

  if (message) {
    applyPromptTimeline(breakdown, role, message.content, timestamp);
    const usage = firstObject(message.usage);
    const usageTokens = usage ? usageTotal(usage) : 0;
    const model = normalizeClaudeModel(message.model);
    if (model && (usageTokens > 0 || !breakdown.model)) breakdown.model = model;
    const selectedUsage = usageTokens > 0 ? usageSelection.usageByOccurrence.get(usageOccurrenceKey) : undefined;
    if (selectedUsage) {
      applyUsage(breakdown, selectedUsage);
      breakdown.usageEvents.push({ timestamp, model, usage: selectedUsage });
    }
    applyContentSignals(breakdown, message.content);
  }

  if (looksFailedToolResult(record.toolUseResult)) breakdown.failedToolCallCount += 1;
}

function selectClaudeUsageOccurrences(files: ClaudeSessionFile[]): ClaudeUsageSelection {
  const usageByOccurrence = new Map<string, Record<string, unknown>>();
  const selectedByDedupKey = new Map<string, { occurrence: string; usage: Record<string, unknown> }>();

  for (const file of files) {
    let parse: { records: ClaudeRecord[] };
    try {
      parse = parseJsonLines(fs.readFileSync(file.filePath, "utf8"));
    } catch {
      continue;
    }

    for (const [recordIndex, record] of parse.records.entries()) {
      const message = firstObject(record.message);
      const usage = firstObject(message?.usage);
      if (!message || !usage || usageTotal(usage) <= 0) continue;

      const occurrence = occurrenceKey(file.filePath, recordIndex);
      const dedupKey = usageDedupKey(record, message);
      if (!dedupKey) {
        usageByOccurrence.set(occurrence, usage);
        continue;
      }

      const selected = selectedByDedupKey.get(dedupKey);
      if (selected) {
        mergeUsageMax(selected.usage, usage);
      } else {
        selectedByDedupKey.set(dedupKey, { occurrence, usage: cloneUsage(usage) });
      }
    }
  }

  for (const selected of selectedByDedupKey.values()) {
    usageByOccurrence.set(selected.occurrence, selected.usage);
  }

  return { usageByOccurrence };
}

function usageDedupKey(record: ClaudeRecord, message: Record<string, unknown>): string | undefined {
  const messageId = stringValue(message.id);
  const requestId = stringValue(record.requestId);
  if (!messageId || !requestId) return undefined;
  return `${requestId}:${messageId}`;
}

function occurrenceKey(filePath: string, recordIndex: number): string {
  return `${path.resolve(filePath)}:${recordIndex}`;
}

function cloneUsage(usage: Record<string, unknown>): Record<string, unknown> {
  return {
    input_tokens: numberValue(usage.input_tokens),
    cache_read_input_tokens: numberValue(usage.cache_read_input_tokens),
    cache_creation_input_tokens: numberValue(usage.cache_creation_input_tokens),
    output_tokens: numberValue(usage.output_tokens),
  };
}

function mergeUsageMax(target: Record<string, unknown>, usage: Record<string, unknown>): void {
  target.input_tokens = Math.max(numberValue(target.input_tokens), numberValue(usage.input_tokens));
  target.cache_read_input_tokens = Math.max(numberValue(target.cache_read_input_tokens), numberValue(usage.cache_read_input_tokens));
  target.cache_creation_input_tokens = Math.max(numberValue(target.cache_creation_input_tokens), numberValue(usage.cache_creation_input_tokens));
  target.output_tokens = Math.max(numberValue(target.output_tokens), numberValue(usage.output_tokens));
}

function applyUsage(breakdown: ClaudeSessionBreakdown, usage: Record<string, unknown>): void {
  const input = numberValue(usage.input_tokens);
  const cacheRead = numberValue(usage.cache_read_input_tokens);
  const cacheCreation = numberValue(usage.cache_creation_input_tokens);
  const output = numberValue(usage.output_tokens);
  breakdown.inputTokens += input + cacheRead + cacheCreation;
  breakdown.cachedInputTokens += cacheRead;
  breakdown.cacheCreationInputTokens += cacheCreation;
  breakdown.outputTokens += output;
  breakdown.usageCount += 1;
}

function segmentClaudeBreakdownByDayAndModel(breakdown: ClaudeSessionBreakdown): Array<{ breakdown: ClaudeSessionBreakdown; suffix: string }> {
  const events = breakdown.usageEvents.filter((event) => event.timestamp);
  const keys = new Set(events.map((event) => segmentKey(event.timestamp, event.model)));
  if (keys.size <= 1) return [{ breakdown, suffix: "" }];

  const groups = new Map<string, { day: string; model: string | undefined; events: ClaudeUsageEvent[] }>();
  for (const event of events) {
    const key = segmentKey(event.timestamp, event.model);
    const day = dateKey(event.timestamp);
    const existing = groups.get(key) ?? { day, model: event.model, events: [] };
    existing.events.push(event);
    groups.set(key, existing);
  }

  return [...groups.values()]
    .sort((a, b) => a.day.localeCompare(b.day) || (a.model ?? "").localeCompare(b.model ?? ""))
    .map((group) => {
      const segment = cloneBreakdownMetadata(breakdown);
      segment.model = group.model ?? breakdown.model;
      segment.startedAt = group.events.map((event) => event.timestamp).filter(Boolean).sort()[0];
      segment.endedAt = group.events.map((event) => event.timestamp).filter(Boolean).sort().at(-1);
      // Day/model segments are built from usage-bearing assistant turns; do not duplicate user prompts across split segments.
      segment.assistantMessageCount = group.events.length;
      segment.messageCount = group.events.length;
      segment.rawEventCount = group.events.length;
      for (const event of group.events) {
        applyUsage(segment, event.usage);
        segment.usageEvents.push(event);
      }
      segment.totalTokens = segment.inputTokens + segment.outputTokens;
      return { breakdown: segment, suffix: `#${group.day}${group.model ? `#${group.model}` : ""}` };
    });
}

function cloneBreakdownMetadata(breakdown: ClaudeSessionBreakdown): ClaudeSessionBreakdown {
  return {
    ...emptyBreakdown(),
    id: breakdown.id,
    title: breakdown.title,
    cwd: breakdown.cwd,
    gitBranch: breakdown.gitBranch,
    entrypoint: breakdown.entrypoint,
    version: breakdown.version,
    parseStatus: breakdown.parseStatus,
    parseErrors: [...breakdown.parseErrors],
    warnings: [...breakdown.warnings, "claude_session_split_by_activity_day"],
  };
}

function segmentKey(timestamp: string | undefined, model: string | undefined): string {
  return `${dateKey(timestamp)}\0${model ?? ""}`;
}

function dateKey(timestamp: string | undefined): string {
  return timestamp?.slice(0, 10) ?? "unknown-date";
}

function usageTotal(usage: Record<string, unknown>): number {
  return numberValue(usage.input_tokens) + numberValue(usage.cache_read_input_tokens) + numberValue(usage.cache_creation_input_tokens) + numberValue(usage.output_tokens);
}

function applyContentSignals(breakdown: ClaudeSessionBreakdown, content: unknown): void {
  if (!Array.isArray(content)) return;
  for (const item of content) {
    const object = firstObject(item);
    if (!object || object.type !== "tool_use") continue;
    breakdown.toolCallCount += 1;
    const name = stringValue(object.name)?.toLowerCase() ?? "";
    if (name === "bash") breakdown.shellCommandCount += 1;
    if (name === "read") breakdown.fileReadCount += 1;
    if (["edit", "multiedit", "write", "notebookedit"].includes(name)) breakdown.fileEditCount += 1;
  }
}

function parseJsonLines(text: string): { records: ClaudeRecord[]; errors: string[] } {
  const records: ClaudeRecord[] = [];
  const errors: string[] = [];
  text
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => Boolean(line))
    .forEach(({ line, index }) => {
      try {
        const parsed = JSON.parse(line) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          records.push(parsed as ClaudeRecord);
        }
      } catch (error) {
        errors.push(`jsonl_line_${index + 1}:${errorMessage(error)}`);
      }
    });
  return { records, errors };
}

function emptyBreakdown(): ClaudeSessionBreakdown {
  return {
    id: undefined,
    title: undefined,
    cwd: undefined,
    gitBranch: undefined,
    entrypoint: undefined,
    version: undefined,
    startedAt: undefined,
    endedAt: undefined,
    model: undefined,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    usageCount: 0,
    messageCount: 0,
    userPromptCount: 0,
    assistantMessageCount: 0,
    toolCallCount: 0,
    shellCommandCount: 0,
    failedToolCallCount: 0,
    fileReadCount: 0,
    fileEditCount: 0,
    rawEventCount: 0,
    parseStatus: "ok",
    parseErrors: [],
    promptTimeline: [],
    warnings: [],
    usageEvents: [],
  };
}

function applyPromptTimeline(breakdown: ClaudeSessionBreakdown, role: string | undefined, content: unknown, timestamp: string | undefined): void {
  if (breakdown.promptTimeline.length >= 80 || (role !== "user" && role !== "assistant")) return;
  const text = extractClaudeMessageText(content);
  if (!text) return;
  breakdown.promptTimeline.push({
    role,
    text: normalizeTimelineText(text),
    timestamp,
  });
}

function extractClaudeMessageText(content: unknown): string | undefined {
  if (typeof content === "string" && content.trim()) return content;
  if (!Array.isArray(content)) return undefined;
  const parts = content
    .flatMap((item) => {
      if (typeof item === "string") return [item];
      const object = firstObject(item);
      if (!object || object.type !== "text") return [];
      const text = stringValue(object.text);
      return text ? [text] : [];
    })
    .filter((item) => item.trim());
  return parts.length ? parts.join("\n") : undefined;
}

function normalizeTimelineText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 1000);
}

function inferProjectPath(projectDir: string, projectsPath: string): string {
  const name = path.basename(projectDir);
  if (name.startsWith("-")) {
    return `${path.sep}${name.slice(1).split("-").filter(Boolean).join(path.sep)}`;
  }
  const relative = path.relative(projectsPath, projectDir);
  return relative && !relative.startsWith("..") ? path.join(projectsPath, relative) : projectDir;
}

function inferOutcome(breakdown: ClaudeSessionBreakdown): NormalizedUsage["sessionOutcome"] {
  if (breakdown.parseStatus === "failed") return "failed";
  if (breakdown.failedToolCallCount > 0) return "partial";
  if (breakdown.fileEditCount > 0) return "completed";
  if (breakdown.shellCommandCount > 0) return "setup_debugging";
  if (breakdown.userPromptCount > 0 || breakdown.assistantMessageCount > 0) return "research_only";
  return "unknown";
}

function claudeSurface(entrypoint: string | undefined): NormalizedUsage["detectedSurface"] {
  const value = entrypoint?.toLowerCase() ?? "";
  if (value.includes("vscode")) return "vscode_extension";
  if (value.includes("local-agent") || value.includes("desktop")) return "local_agent";
  return "terminal_cli";
}

function claudeSourceAppLabel(entrypoint: string | undefined): string {
  const value = entrypoint?.toLowerCase() ?? "";
  if (value.includes("vscode")) return "VS Code";
  if (value.includes("local-agent") || value.includes("desktop")) return "Claude Desktop App";
  if (value === "cli" || value.includes("terminal")) return "Terminal";
  return "Claude Code";
}

function defaultClaudeHome(): string {
  return process.env.CLAUDE_CONFIG_DIR?.split(",").map((item) => item.trim()).filter(Boolean)[0] ?? path.join(os.homedir(), ".claude");
}

function defaultDesktopSessionRoots(): string[] {
  const home = os.homedir();
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return [
    path.join(home, "Library", "Application Support", "Claude", "local-agent-mode-sessions"),
    path.join(xdg, "Claude", "local-agent-mode-sessions"),
  ];
}

function uniqueSessionFiles(files: ClaudeSessionFile[]): ClaudeSessionFile[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = path.resolve(file.filePath);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function countHistoryEntries(historyPath: string): number {
  if (!fs.existsSync(historyPath)) return 0;
  let entryCount = 0;
  try {
    for (const line of fs.readFileSync(historyPath, "utf8").split(/\r?\n/).filter(Boolean)) {
      try {
        JSON.parse(line);
        entryCount += 1;
      } catch {
        continue;
      }
    }
  } catch {
    return entryCount;
  }
  return entryCount;
}

function firstObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function normalizeClaudeModel(value: unknown): string | undefined {
  const model = stringValue(value);
  if (!model || model === "<synthetic>") return undefined;
  return model;
}

function dateValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function minDate(current: string | undefined, candidate: string): string {
  return !current || candidate < current ? candidate : current;
}

function maxDate(current: string | undefined, candidate: string): string {
  return !current || candidate > current ? candidate : current;
}

function durationMs(startedAt: string | undefined, endedAt: string | undefined): number | undefined {
  if (!startedAt || !endedAt) return undefined;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : undefined;
}

function looksFailedToolResult(value: unknown): boolean {
  const object = firstObject(value);
  if (!object) return false;
  if (object.is_error === true || object.error === true) return true;
  const exitCode = numberValue(object.exit_code ?? object.exitCode ?? object.status_code ?? object.statusCode);
  if (exitCode !== 0) return true;
  const status = stringValue(object.status)?.toLowerCase();
  return status === "failed" || status === "error";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeMtimeMs(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}
