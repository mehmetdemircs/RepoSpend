import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { NormalizedUsage, PromptTimelineItem, RepoSpendConfig, SourceStatus } from "@repospend/types";
import { calculateCostUsd, type PricingTable } from "../pricing.js";
import { resolveRepoInfo } from "../repo.js";

const parserVersion = "cursor-v1";
const maxJsonlBytes = 20 * 1024 * 1024;
const maxDatabaseBytes = 100 * 1024 * 1024;
const cursorStoragePrefixes = ["cursor.", "anysphere."];
const interestingTerms = ["cursor", "composer", "aichat", "ai_chat", "aiservice", "agent-transcript", "prompttokenbreakdown"];

type CursorSurface = "cli" | "desktop" | "unknown";

interface CursorRecordBreakdown {
  id: string | undefined;
  title: string | undefined;
  cwd: string | undefined;
  startedAt: string | undefined;
  endedAt: string | undefined;
  model: string | undefined;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  usageCount: number;
  estimatedCostUsd: number | undefined;
  costCount: number;
  hasEstimatedPromptTokens: boolean;
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
  matchedKeys: string[];
}

interface CursorSessionCandidate {
  sourcePath: string;
  surface: CursorSurface;
  fallbackCwd: string | undefined;
  breakdown: CursorRecordBreakdown;
}

export interface CursorAdapterOptions {
  cursorHome?: string;
  config?: RepoSpendConfig;
  pricing: PricingTable;
}

export interface CursorScanResult {
  source: SourceStatus;
  sessions: NormalizedUsage[];
  stats: CursorScanStats;
}

export interface CursorScanStats {
  sourceId: "cursor";
  sourceLabel: "Cursor";
  homePath: string;
  cursorHome: string;
  globalStoragePath: string;
  workspaceStoragePath: string;
  projectsPath: string;
  statePath: string;
  projectsExists: boolean;
  stateExists: boolean;
  sessionsExists: boolean;
  sessionFileCount: number;
  databaseFileCount: number;
  skippedFileCount: number;
  sessionsImported: number;
  parseFailureCount: number;
  unreadableFileCount: number;
  malformedFileCount: number;
  lastScannedAt: string;
}

interface CursorDiscovery {
  roots: string[];
  projectsPath: string;
  globalStoragePath: string;
  workspaceStoragePath: string;
  statePath: string;
  jsonlFiles: string[];
  databaseFiles: string[];
  skippedFileCount: number;
  warnings: string[];
}

export function scanCursor(options: CursorAdapterOptions): CursorScanResult {
  const cursorHome = options.cursorHome ?? path.join(os.homedir(), ".cursor");
  const discovery = discoverCursorFiles(cursorHome, Boolean(options.cursorHome));
  const jsonlCandidates = discovery.jsonlFiles.map((filePath) => cursorJsonlToCandidate(filePath, cursorHome));
  const databaseCandidates = discovery.databaseFiles.flatMap((filePath) => cursorDatabaseToCandidates(filePath, cursorHome, discovery.warnings));
  const candidates = dedupeCandidates([...jsonlCandidates, ...databaseCandidates]);
  const sessions = candidates.map((candidate, index) => candidateToUsage(candidate, index, options));
  const parseFailureCount = sessions.filter((session) => session.parseStatus === "failed" || (session.parseErrors?.length ?? 0) > 0).length;
  const unreadableFileCount = sessions.filter((session) => session.parseErrors?.some((error) => error.startsWith("unable_to_read_"))).length;
  const malformedFileCount = sessions.filter((session) => session.parseErrors?.some((error) => error.startsWith("jsonl_line_") || error.startsWith("sqlite_json_parse:"))).length;

  if (!fs.existsSync(cursorHome)) {
    discovery.warnings.push(`Cursor home directory not found at ${cursorHome}`);
  }
  if (!fs.existsSync(discovery.statePath)) {
    discovery.warnings.push(`Cursor global state database not found at ${discovery.statePath}`);
  }

  return {
    source: {
      id: "cursor",
      label: "Cursor",
      available: discovery.jsonlFiles.length > 0 || discovery.databaseFiles.length > 0,
      paths: unique([cursorHome, discovery.projectsPath, discovery.statePath, discovery.workspaceStoragePath, ...discovery.roots]),
      warnings: discovery.warnings,
    },
    sessions,
    stats: {
      sourceId: "cursor",
      sourceLabel: "Cursor",
      homePath: cursorHome,
      cursorHome,
      globalStoragePath: discovery.globalStoragePath,
      workspaceStoragePath: discovery.workspaceStoragePath,
      projectsPath: discovery.projectsPath,
      statePath: discovery.statePath,
      projectsExists: fs.existsSync(discovery.projectsPath),
      stateExists: fs.existsSync(discovery.statePath),
      sessionsExists: discovery.jsonlFiles.length > 0,
      sessionFileCount: discovery.jsonlFiles.length,
      databaseFileCount: discovery.databaseFiles.length,
      skippedFileCount: discovery.skippedFileCount,
      sessionsImported: sessions.length,
      parseFailureCount,
      unreadableFileCount,
      malformedFileCount,
      lastScannedAt: new Date().toISOString(),
    },
  };
}

function discoverCursorFiles(cursorHome: string, explicitHome: boolean): CursorDiscovery {
  const warnings: string[] = [];
  const appPaths = defaultCursorAppPaths();
  const roots = explicitHome ? [cursorHome] : unique([cursorHome, appPaths.statePath, ...cursorOwnedGlobalStorageRoots(appPaths.globalStoragePath), ...cursorOwnedWorkspaceStorageRoots(appPaths.workspaceStoragePath)]);
  const jsonlFiles: string[] = [];
  const databaseFiles: string[] = [];
  let skippedFileCount = 0;

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      if (isReadableRegularFile(root, maxDatabaseBytes)) {
        databaseFiles.push(root);
        continue;
      }
      walk(root, 10, (filePath) => {
        const lower = filePath.toLowerCase();
        if (lower.endsWith(".jsonl")) {
          if (isReadableRegularFile(filePath, maxJsonlBytes)) jsonlFiles.push(filePath);
          else skippedFileCount += 1;
          return;
        }
        if (/\.(sqlite|db|vscdb)$/i.test(filePath)) {
          if (isReadableRegularFile(filePath, maxDatabaseBytes)) databaseFiles.push(filePath);
          else skippedFileCount += 1;
        }
      });
    } catch (error) {
      warnings.push(`Unable to inspect Cursor path ${root}: ${errorMessage(error)}`);
    }
  }

  return {
    roots,
    projectsPath: path.join(cursorHome, "projects"),
    globalStoragePath: appPaths.globalStoragePath,
    workspaceStoragePath: appPaths.workspaceStoragePath,
    statePath: appPaths.statePath,
    jsonlFiles: unique(jsonlFiles).sort(cursorJsonlSort),
    databaseFiles: unique(databaseFiles).sort(),
    skippedFileCount,
    warnings,
  };
}

function cursorOwnedGlobalStorageRoots(globalStoragePath: string): string[] {
  return cursorOwnedChildDirs(globalStoragePath);
}

function cursorOwnedWorkspaceStorageRoots(workspaceStoragePath: string): string[] {
  if (!fs.existsSync(workspaceStoragePath)) return [];
  const roots: string[] = [];
  try {
    for (const workspace of fs.readdirSync(workspaceStoragePath, { withFileTypes: true })) {
      if (!workspace.isDirectory()) continue;
      roots.push(...cursorOwnedChildDirs(path.join(workspaceStoragePath, workspace.name)));
    }
  } catch {
    return [];
  }
  return roots;
}

function cursorOwnedChildDirs(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && cursorStoragePrefixes.some((prefix) => entry.name.toLowerCase().startsWith(prefix)))
      .map((entry) => path.join(root, entry.name));
  } catch {
    return [];
  }
}

function defaultCursorAppPaths(): { globalStoragePath: string; workspaceStoragePath: string; statePath: string } {
  const home = os.homedir();
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    const globalStoragePath = path.join(appData, "Cursor", "User", "globalStorage");
    return {
      globalStoragePath,
      workspaceStoragePath: path.join(appData, "Cursor", "User", "workspaceStorage"),
      statePath: path.join(globalStoragePath, "state.vscdb"),
    };
  }
  if (process.platform === "darwin") {
    const globalStoragePath = path.join(home, "Library", "Application Support", "Cursor", "User", "globalStorage");
    return {
      globalStoragePath,
      workspaceStoragePath: path.join(home, "Library", "Application Support", "Cursor", "User", "workspaceStorage"),
      statePath: path.join(globalStoragePath, "state.vscdb"),
    };
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  const globalStoragePath = path.join(xdg, "Cursor", "User", "globalStorage");
  return {
    globalStoragePath,
    workspaceStoragePath: path.join(xdg, "Cursor", "User", "workspaceStorage"),
    statePath: path.join(globalStoragePath, "state.vscdb"),
  };
}

function walk(root: string, maxDepth: number, onFile: (filePath: string) => void, depth = 0): void {
  if (depth > maxDepth) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "CachedData" || entry.name === "Cache") continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, maxDepth, onFile, depth + 1);
    } else if (entry.isFile()) {
      onFile(fullPath);
    }
  }
}

function isReadableRegularFile(filePath: string, maxBytes: number): boolean {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size <= maxBytes;
  } catch {
    return false;
  }
}

function cursorJsonlSort(a: string, b: string): number {
  const aTranscript = a.includes(`${path.sep}agent-transcripts${path.sep}`) ? 0 : 1;
  const bTranscript = b.includes(`${path.sep}agent-transcripts${path.sep}`) ? 0 : 1;
  return aTranscript - bTranscript || a.localeCompare(b);
}

function cursorJsonlToCandidate(filePath: string, cursorHome: string): CursorSessionCandidate {
  const breakdown = emptyBreakdown();
  try {
    const parse = parseJsonLines(fs.readFileSync(filePath, "utf8"));
    breakdown.rawEventCount = parse.records.length;
    breakdown.parseErrors = parse.errors;
    breakdown.parseStatus = parse.errors.length ? (parse.records.length ? "partial" : "failed") : "ok";
    for (const record of parse.records) applyCursorRecord(breakdown, record);
    finalizeBreakdown(breakdown);
  } catch (error) {
    const message = `unable_to_read_cursor_jsonl:${errorMessage(error)}`;
    breakdown.parseStatus = "failed";
    breakdown.parseErrors.push(message);
    breakdown.warnings.push(message);
  }
  if (!breakdown.id) breakdown.id = path.basename(filePath).replace(/\.jsonl$/i, "") || undefined;
  return {
    sourcePath: filePath,
    surface: inferSurfaceFromPath(filePath),
    fallbackCwd: inferProjectPathFromCursorPath(filePath, cursorHome),
    breakdown,
  };
}

function cursorDatabaseToCandidates(filePath: string, cursorHome: string, warnings: string[]): CursorSessionCandidate[] {
  const candidates: CursorSessionCandidate[] = [];
  let db: Database.Database | undefined;
  try {
    db = new Database(filePath, { readonly: true, fileMustExist: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    for (const table of tables) {
      const columns = safeColumns(db, table.name, warnings);
      if (!columns.length) continue;
      const selectedColumns = columns.filter((column) => isLikelyTextColumn(column.name, column.type));
      if (!selectedColumns.length) continue;
      const rows = safeRows(db, table.name, selectedColumns.map((column) => column.name), warnings);
      for (const row of rows) {
        const match = candidateFromDatabaseRow(filePath, cursorHome, table.name, row);
        if (match) candidates.push(match);
      }
    }
  } catch (error) {
    warnings.push(`Unable to read Cursor SQLite database at ${filePath}: ${errorMessage(error)}`);
  } finally {
    db?.close();
  }
  return candidates;
}

function safeColumns(db: Database.Database, table: string, warnings: string[]): Array<{ name: string; type: string }> {
  try {
    return db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string; type: string }>;
  } catch (error) {
    warnings.push(`Unable to inspect Cursor SQLite table ${table}: ${errorMessage(error)}`);
    return [];
  }
}

function safeRows(db: Database.Database, table: string, columns: string[], warnings: string[]): Array<Record<string, unknown>> {
  try {
    const select = columns.map(quoteIdentifier).join(", ");
    return db.prepare(`SELECT ${select} FROM ${quoteIdentifier(table)} LIMIT 500`).all() as Array<Record<string, unknown>>;
  } catch (error) {
    warnings.push(`Unable to scan Cursor SQLite table ${table}: ${errorMessage(error)}`);
    return [];
  }
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function isLikelyTextColumn(name: string, type: string): boolean {
  const normalized = `${name} ${type}`.toLowerCase();
  return type === "" || normalized.includes("text") || normalized.includes("char") || normalized.includes("json") || normalized.includes("blob") || interestingTerms.some((term) => normalized.includes(term));
}

function candidateFromDatabaseRow(filePath: string, cursorHome: string, table: string, row: Record<string, unknown>): CursorSessionCandidate | undefined {
  const records: unknown[] = [];
  const matchedKeys: string[] = [];
  const parseErrors: string[] = [];
  const textEntries = Object.entries(row)
    .map(([key, value]) => ({ key, text: textValue(value) }))
    .filter((entry): entry is { key: string; text: string } => Boolean(entry.text));
  const rowLooksInteresting = textEntries.some(({ key, text }) => looksCursorInteresting(key, text));
  if (!rowLooksInteresting) return undefined;
  for (const { key, text } of textEntries) {
    if (!looksCursorInteresting(key, text) && !text.trim().startsWith("{") && !text.trim().startsWith("[")) continue;
    matchedKeys.push(`${table}.${key}`);
    const parsed = parseJsonBlob(text);
    if (parsed.ok && Array.isArray(parsed.value)) records.push(...parsed.value);
    else if (parsed.ok) records.push(parsed.value);
    else records.push({ key, value: text.slice(0, 2000) });
    if (!parsed.ok && text.trim().startsWith("{")) parseErrors.push(`sqlite_json_parse:${table}.${key}:${parsed.error}`);
  }
  if (!records.length) return undefined;

  const breakdown = emptyBreakdown();
  breakdown.parseErrors = parseErrors;
  breakdown.parseStatus = parseErrors.length ? "partial" : "ok";
  breakdown.rawEventCount = records.length;
  breakdown.matchedKeys = unique(matchedKeys);
  for (const record of records) applyCursorRecord(breakdown, record);
  finalizeBreakdown(breakdown);
  if (isCursorMetadataOnlyBreakdown(breakdown)) return undefined;

  return {
    sourcePath: `${filePath}#${table}`,
    surface: inferSurfaceFromPath(filePath),
    fallbackCwd: inferProjectPathFromCursorPath(filePath, cursorHome),
    breakdown,
  };
}

function isCursorMetadataOnlyBreakdown(breakdown: CursorRecordBreakdown): boolean {
  return breakdown.messageCount === 0
    && breakdown.usageCount === 0
    && !breakdown.hasEstimatedPromptTokens
    && breakdown.costCount === 0;
}

function looksCursorInteresting(key: string, text: string): boolean {
  const haystack = `${key}\n${text.slice(0, 4000)}`.toLowerCase();
  return interestingTerms.some((term) => haystack.includes(term));
}

function parseJsonBlob(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return { ok: false, error: "not_json" };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

function parseJsonLines(text: string): { records: unknown[]; errors: string[] } {
  const records: unknown[] = [];
  const errors: string[] = [];
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

function applyCursorRecord(breakdown: CursorRecordBreakdown, record: unknown): void {
  const objects = collectObjects(record, 6, 150);
  const root = firstObject(record);
  const timestamp = firstValueByKeys(objects, ["timestamp", "createdAt", "created_at", "lastUpdatedAt", "conversationCheckpointLastUpdatedAt", "time", "date"]);
  const date = dateValue(timestamp);
  if (date) {
    breakdown.startedAt = minDate(breakdown.startedAt, date);
    breakdown.endedAt = maxDate(breakdown.endedAt, date);
  }

  breakdown.id ??= firstStringByKeys(objects, ["sessionId", "session_id", "conversationId", "conversation_id", "composerId", "composer_id", "chatId", "chat_id"]);
  breakdown.title ??= firstStringByKeys(objects, ["title", "name", "summary"]);
  breakdown.cwd ??= firstPathByKeys(objects, ["cwd", "workspacePath", "workspace_path", "projectPath", "project_path", "repoPath", "repo_path", "rootPath", "root_path"]);
  breakdown.model ??= firstStringByKeys(objects, ["model", "modelName", "model_name", "modelId", "model_id"]);

  const role = inferRole(objects, root);
  const text = extractMessageText(objects, role);
  if (role === "user") breakdown.userPromptCount += 1;
  if (role === "assistant") breakdown.assistantMessageCount += 1;
  if (role === "user" || role === "assistant") {
    breakdown.messageCount += 1;
    if (text && breakdown.promptTimeline.length < 80) {
      breakdown.promptTimeline.push({ role, text: normalizeTimelineText(text), timestamp: date });
    }
  }

  const usage = extractUsage(objects);
  if (usage.inputTokens + usage.cachedInputTokens + usage.outputTokens + usage.reasoningTokens + usage.totalTokens > 0) {
    breakdown.inputTokens += usage.inputTokens;
    breakdown.cachedInputTokens += usage.cachedInputTokens;
    breakdown.outputTokens += usage.outputTokens;
    breakdown.reasoningTokens += usage.reasoningTokens;
    breakdown.totalTokens += usage.totalTokens;
    breakdown.usageCount += 1;
    if (usage.estimatedPromptTokens) breakdown.hasEstimatedPromptTokens = true;
  }

  const cost = firstNumberByKeys(objects, ["costUsd", "cost_usd", "estimatedCostUsd", "estimated_cost_usd", "cost"]);
  if (cost !== undefined && cost >= 0) {
    breakdown.estimatedCostUsd = roundCurrency((breakdown.estimatedCostUsd ?? 0) + cost);
    breakdown.costCount += 1;
  }

  applyToolSignals(breakdown, objects);
}

function collectObjects(value: unknown, maxDepth: number, maxObjects: number, objects: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (objects.length >= maxObjects || maxDepth < 0) return objects;
  if (!value || typeof value !== "object") return objects;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 80)) collectObjects(item, maxDepth - 1, maxObjects, objects);
    return objects;
  }
  const object = value as Record<string, unknown>;
  objects.push(object);
  for (const child of Object.values(object)) collectObjects(child, maxDepth - 1, maxObjects, objects);
  return objects;
}

function firstObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function firstStringByKeys(objects: Record<string, unknown>[], keys: string[]): string | undefined {
  for (const object of objects) {
    for (const key of keys) {
      const value = stringValue(object[key]);
      if (value) return value;
    }
  }
  return undefined;
}

function firstValueByKeys(objects: Record<string, unknown>[], keys: string[]): unknown {
  for (const object of objects) {
    for (const key of keys) {
      if (object[key] !== undefined && object[key] !== null && object[key] !== "") return object[key];
    }
  }
  return undefined;
}

function firstPathByKeys(objects: Record<string, unknown>[], keys: string[]): string | undefined {
  const value = firstStringByKeys(objects, keys);
  if (!value) return undefined;
  if (value.startsWith("file://")) return value.replace(/^file:\/\//, "");
  return value;
}

function firstNumberByKeys(objects: Record<string, unknown>[], keys: string[]): number | undefined {
  for (const object of objects) {
    for (const key of keys) {
      const value = numberValue(object[key]);
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

function inferRole(objects: Record<string, unknown>[], root: Record<string, unknown> | undefined): "user" | "assistant" | undefined {
  const role = firstStringByKeys(objects, ["role", "author", "speaker", "from"])?.toLowerCase();
  if (role === "user" || role === "human") return "user";
  if (role === "assistant" || role === "ai" || role === "agent") return "assistant";
  const type = (stringValue(root?.type) ?? stringValue(root?.event) ?? "").toLowerCase();
  if (type.includes("user") || type.includes("prompt")) return "user";
  if (type.includes("assistant") || type.includes("response") || type.includes("completion")) return "assistant";
  return undefined;
}

function extractMessageText(objects: Record<string, unknown>[], role: "user" | "assistant" | undefined): string | undefined {
  if (!role) return undefined;
  for (const object of objects) {
    for (const key of ["text", "content", "message", "prompt", "response", "answer"]) {
      const text = textFromUnknown(object[key]);
      if (text) return text;
    }
  }
  return undefined;
}

function textFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    const parts = value.map(textFromUnknown).filter((item): item is string => Boolean(item));
    return parts.length ? parts.join("\n") : undefined;
  }
  const object = firstObject(value);
  if (!object) return undefined;
  return stringValue(object.text) ?? stringValue(object.content) ?? stringValue(object.value);
}

function extractUsage(objects: Record<string, unknown>[]): { inputTokens: number; cachedInputTokens: number; outputTokens: number; reasoningTokens: number; totalTokens: number; estimatedPromptTokens: boolean } {
  const usageObjects = objects.filter((object) => Object.keys(object).some((key) => key.toLowerCase().includes("token") || key.toLowerCase() === "usage"));
  const candidates = usageObjects.length ? usageObjects : objects;
  return {
    inputTokens: firstNumberByKeys(candidates, ["inputTokens", "input_tokens", "promptTokens", "prompt_tokens", "totalUsedTokens"]) ?? 0,
    cachedInputTokens: firstNumberByKeys(candidates, ["cachedInputTokens", "cached_input_tokens", "cacheReadInputTokens", "cache_read_input_tokens"]) ?? 0,
    outputTokens: firstNumberByKeys(candidates, ["outputTokens", "output_tokens", "completionTokens", "completion_tokens"]) ?? 0,
    reasoningTokens: firstNumberByKeys(candidates, ["reasoningTokens", "reasoning_tokens", "reasoningOutputTokens", "reasoning_output_tokens"]) ?? 0,
    totalTokens: firstNumberByKeys(candidates, ["totalTokens", "total_tokens", "tokens", "tokenCount", "token_count"]) ?? 0,
    estimatedPromptTokens: firstNumberByKeys(candidates, ["totalUsedTokens"]) !== undefined,
  };
}

function applyToolSignals(breakdown: CursorRecordBreakdown, objects: Record<string, unknown>[]): void {
  const typeText = objects.flatMap((object) => [stringValue(object.type), stringValue(object.event), stringValue(object.toolName), stringValue(object.tool_name), stringValue(object.name)]).filter((item): item is string => Boolean(item)).join(" ").toLowerCase();
  if (typeText.includes("tool")) breakdown.toolCallCount += 1;
  if (typeText.includes("terminal") || typeText.includes("shell") || typeText.includes("command")) breakdown.shellCommandCount += 1;
  if (typeText.includes("read")) breakdown.fileReadCount += 1;
  if (typeText.includes("edit") || typeText.includes("write") || typeText.includes("apply")) breakdown.fileEditCount += 1;
  if (objects.some(looksFailed)) breakdown.failedToolCallCount += 1;
}

function looksFailed(object: Record<string, unknown>): boolean {
  if (object.isError === true || object.is_error === true || object.error === true) return true;
  const status = stringValue(object.status)?.toLowerCase();
  if (status === "failed" || status === "error") return true;
  const exitCode = numberValue(object.exitCode ?? object.exit_code ?? object.statusCode ?? object.status_code);
  return exitCode !== undefined && exitCode !== 0;
}

function finalizeBreakdown(breakdown: CursorRecordBreakdown): void {
  if (breakdown.totalTokens === 0) {
    breakdown.totalTokens = breakdown.inputTokens + breakdown.outputTokens + breakdown.reasoningTokens;
  }
  if (breakdown.messageCount === 0) {
    breakdown.messageCount = breakdown.userPromptCount + breakdown.assistantMessageCount;
  }
}

function candidateToUsage(candidate: CursorSessionCandidate, index: number, options: CursorAdapterOptions): NormalizedUsage {
  const breakdown = candidate.breakdown;
  const id = breakdown.id ?? `${path.basename(candidate.sourcePath).replace(/\.(jsonl|sqlite|db|vscdb)$/i, "") || "cursor-session"}-${index}`;
  const cwd = breakdown.cwd ?? candidate.fallbackCwd ?? process.cwd();
  const repo = resolveRepoInfo(cwd, options.config);
  const hasTokenBreakdown = breakdown.inputTokens + breakdown.cachedInputTokens + breakdown.outputTokens + breakdown.reasoningTokens > 0;
  const tokenAggregationMethod = hasTokenBreakdown ? (breakdown.hasEstimatedPromptTokens ? "estimated" : "direct_usage") : "unknown";
  const tokenWarnings = breakdown.hasEstimatedPromptTokens ? ["cursor_prompt_token_breakdown_estimate"] : [];
  const usage: NormalizedUsage = {
    id,
    sourceClient: "cursor",
    sourceApp: cursorSourceAppLabel(candidate.surface),
    sourceAppRaw: candidate.surface,
    sourcePath: candidate.sourcePath,
    repoRoot: repo.repoRoot,
    repoName: repo.repoName,
    cwd,
    gitRemoteUrl: repo.gitRemoteUrl,
    gitBranch: repo.gitBranch,
    title: breakdown.title,
    startedAt: breakdown.startedAt,
    endedAt: breakdown.endedAt,
    model: breakdown.model,
    provider: providerForModel(breakdown.model ?? ""),
    inputTokens: breakdown.inputTokens,
    cachedInputTokens: breakdown.cachedInputTokens,
    outputTokens: breakdown.outputTokens,
    reasoningTokens: breakdown.reasoningTokens,
    reasoningOutputTokens: breakdown.reasoningTokens,
    totalTokens: breakdown.totalTokens,
    tokenAggregationMethod,
    tokenConfidence: breakdown.hasEstimatedPromptTokens ? "low" : hasTokenBreakdown ? "medium" : "low",
    tokenSnapshotCount: breakdown.usageCount,
    estimatedCostUsd: undefined,
    messageCount: breakdown.messageCount,
    rawTokenTotal: breakdown.totalTokens || undefined,
    warnings: [...repo.warnings, ...breakdown.warnings, ...tokenWarnings, ...(hasTokenBreakdown ? [] : ["missing_token_breakdown"])],
    durationMs: durationMs(breakdown.startedAt, breakdown.endedAt),
    rawEventCount: breakdown.rawEventCount,
    parseStatus: breakdown.parseStatus,
    parseErrors: breakdown.parseErrors,
    detectedSurface: detectedSurface(candidate.surface),
    surfaceConfidence: candidate.surface === "unknown" ? "low" : "medium",
    surfaceReason: cursorSurfaceReason(candidate.surface),
    userPromptCount: breakdown.userPromptCount,
    assistantMessageCount: breakdown.assistantMessageCount,
    toolCallCount: breakdown.toolCallCount,
    shellCommandCount: breakdown.shellCommandCount,
    failedToolCallCount: breakdown.failedToolCallCount,
    nonZeroCommandEvents: 0,
    importantCommandFailures: breakdown.failedToolCallCount,
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
    sourceMetadata: {
      parserVersion,
      cursor: {
        surface: candidate.surface,
        matchedKeys: breakdown.matchedKeys,
        costRecords: breakdown.costCount,
        estimatedPromptTokens: breakdown.hasEstimatedPromptTokens,
      },
    },
  };
  const pricedCost = hasTokenBreakdown ? calculateCostUsd(usage, options.pricing) : undefined;
  const estimatedCostUsd = pricedCost ?? breakdown.estimatedCostUsd;
  return {
    ...usage,
    estimatedCostUsd,
    warnings: estimatedCostUsd === undefined ? [...usage.warnings, breakdown.hasEstimatedPromptTokens ? "cursor_cost_not_estimated_from_prompt_tokens" : hasTokenBreakdown ? "unknown_pricing" : "unknown_cost"] : usage.warnings,
  };
}

function inferProjectPathFromCursorPath(filePath: string, cursorHome: string): string | undefined {
  const parts = filePath.split(path.sep);
  const projectsIndex = parts.lastIndexOf("projects");
  if (projectsIndex >= 0 && projectsIndex < parts.length - 1) {
    const projectId = parts[projectsIndex + 1];
    if (projectId?.startsWith("-")) {
      return `${path.sep}${projectId.slice(1).split("-").filter(Boolean).join(path.sep)}`;
    }
    if (projectId) return path.join(cursorHome, "projects", projectId);
  }
  return undefined;
}

function inferSurfaceFromPath(filePath: string): CursorSurface {
  const lower = filePath.toLowerCase();
  if (lower.includes(`${path.sep}agent-transcripts${path.sep}`) || lower.endsWith(".jsonl")) return "cli";
  if (lower.includes(`${path.sep}workspaceStorage${path.sep}`.toLowerCase()) || lower.includes(`${path.sep}globalStorage${path.sep}`.toLowerCase()) || lower.endsWith(".vscdb")) return "desktop";
  return "unknown";
}

function cursorSourceAppLabel(surface: CursorSurface): string {
  if (surface === "cli") return "Cursor CLI";
  if (surface === "desktop") return "Cursor Desktop";
  return "Cursor";
}

function detectedSurface(surface: CursorSurface): NormalizedUsage["detectedSurface"] {
  if (surface === "cli") return "terminal_cli";
  if (surface === "desktop") return "vscode_extension";
  return "unknown";
}

function cursorSurfaceReason(surface: CursorSurface): string {
  if (surface === "cli") return "Cursor local JSONL transcript";
  if (surface === "desktop") return "Cursor local SQLite/vscdb storage";
  return "Cursor local data";
}

function inferOutcome(breakdown: CursorRecordBreakdown): NormalizedUsage["sessionOutcome"] {
  if (breakdown.parseStatus === "failed") return "failed";
  if (breakdown.failedToolCallCount > 0) return "partial";
  if (breakdown.fileEditCount > 0) return "completed";
  if (breakdown.shellCommandCount > 0) return "setup_debugging";
  if (breakdown.userPromptCount > 0 || breakdown.assistantMessageCount > 0) return "research_only";
  return "unknown";
}

function emptyBreakdown(): CursorRecordBreakdown {
  return {
    id: undefined,
    title: undefined,
    cwd: undefined,
    startedAt: undefined,
    endedAt: undefined,
    model: undefined,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    usageCount: 0,
    estimatedCostUsd: undefined,
    costCount: 0,
    hasEstimatedPromptTokens: false,
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
    matchedKeys: [],
  };
}

function dedupeCandidates(candidates: CursorSessionCandidate[]): CursorSessionCandidate[] {
  const byId = new Map<string, CursorSessionCandidate>();
  const pathOnly: CursorSessionCandidate[] = [];
  for (const candidate of candidates) {
    const id = candidate.breakdown.id;
    if (!id) {
      pathOnly.push(candidate);
      continue;
    }
    const existing = byId.get(id);
    byId.set(id, existing ? mergeCursorCandidates(existing, candidate) : candidate);
  }
  return [...byId.values(), ...pathOnly];
}

function mergeCursorCandidates(a: CursorSessionCandidate, b: CursorSessionCandidate): CursorSessionCandidate {
  const primary = cursorCandidateScore(b) > cursorCandidateScore(a) ? b : a;
  const secondary = primary === a ? b : a;
  return {
    ...primary,
    surface: primary.surface === "unknown" ? secondary.surface : primary.surface,
    fallbackCwd: primary.fallbackCwd ?? secondary.fallbackCwd,
    breakdown: mergeCursorBreakdowns(primary.breakdown, secondary.breakdown),
  };
}

function cursorCandidateScore(candidate: CursorSessionCandidate): number {
  const breakdown = candidate.breakdown;
  const hasTokenBreakdown = breakdown.inputTokens + breakdown.cachedInputTokens + breakdown.outputTokens + breakdown.reasoningTokens > 0;
  return (hasTokenBreakdown ? 1_000_000_000 : 0) + breakdown.totalTokens + breakdown.messageCount * 1_000 + breakdown.rawEventCount;
}

function mergeCursorBreakdowns(primary: CursorRecordBreakdown, secondary: CursorRecordBreakdown): CursorRecordBreakdown {
  return {
    ...primary,
    title: primary.title ?? secondary.title,
    cwd: primary.cwd ?? secondary.cwd,
    startedAt: optionalMinDate(primary.startedAt, secondary.startedAt),
    endedAt: optionalMaxDate(primary.endedAt, secondary.endedAt),
    model: primary.model ?? secondary.model,
    estimatedCostUsd: primary.estimatedCostUsd ?? secondary.estimatedCostUsd,
    costCount: Math.max(primary.costCount, secondary.costCount),
    hasEstimatedPromptTokens: primary.hasEstimatedPromptTokens || secondary.hasEstimatedPromptTokens,
    messageCount: Math.max(primary.messageCount, secondary.messageCount),
    userPromptCount: Math.max(primary.userPromptCount, secondary.userPromptCount),
    assistantMessageCount: Math.max(primary.assistantMessageCount, secondary.assistantMessageCount),
    toolCallCount: Math.max(primary.toolCallCount, secondary.toolCallCount),
    shellCommandCount: Math.max(primary.shellCommandCount, secondary.shellCommandCount),
    failedToolCallCount: Math.max(primary.failedToolCallCount, secondary.failedToolCallCount),
    fileReadCount: Math.max(primary.fileReadCount, secondary.fileReadCount),
    fileEditCount: Math.max(primary.fileEditCount, secondary.fileEditCount),
    rawEventCount: Math.max(primary.rawEventCount, secondary.rawEventCount),
    parseStatus: mergeParseStatus(primary.parseStatus, secondary.parseStatus),
    parseErrors: unique([...primary.parseErrors, ...secondary.parseErrors]),
    promptTimeline: primary.promptTimeline.length >= secondary.promptTimeline.length ? primary.promptTimeline : secondary.promptTimeline,
    warnings: unique([...primary.warnings, ...secondary.warnings, "cursor_duplicate_session_merged"]),
    matchedKeys: unique([...primary.matchedKeys, ...secondary.matchedKeys]),
  };
}

function mergeParseStatus(a: CursorRecordBreakdown["parseStatus"], b: CursorRecordBreakdown["parseStatus"]): CursorRecordBreakdown["parseStatus"] {
  if (a === "failed" || b === "failed") return "failed";
  if (a === "partial" || b === "partial") return "partial";
  return "ok";
}

function optionalMinDate(current: string | undefined, candidate: string | undefined): string | undefined {
  return candidate ? minDate(current, candidate) : current;
}

function optionalMaxDate(current: string | undefined, candidate: string | undefined): string | undefined {
  return candidate ? maxDate(current, candidate) : current;
}

function providerForModel(model: string): string | undefined {
  const normalized = model.toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes("claude")) return "anthropic";
  if (normalized.startsWith("gpt") || normalized.startsWith("o")) return "openai";
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function dateValue(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value < 10_000_000_000 ? value * 1000 : value).toISOString();
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

function normalizeTimelineText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 1000);
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(6));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
