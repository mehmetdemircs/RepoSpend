import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isCopilotAliasModel, normalizePricingModelId, type NormalizedUsage, type PromptTimelineItem, type RepoSpendConfig, type SourceStatus } from "@repospend/types";
import { calculateCostUsd, type PricingTable } from "../pricing.js";
import { resolveRepoInfo } from "../repo.js";
import type { SourceScanWindow } from "./index.js";

const maxJsonlBytes = 50 * 1024 * 1024;
const copilotOtelEnv = "COPILOT_OTEL_FILE_EXPORTER_PATH";

type CopilotSurface = "cli" | "vscode" | "unknown";
type CopilotUsageSource = "chat_span" | "inference_log" | "agent_turn_log" | "agent_summary_span";

interface CopilotAdapterOptions {
  copilotHome?: string;
  codeUserRoots?: string[];
  config?: RepoSpendConfig;
  scanWindow?: SourceScanWindow;
  pricing: PricingTable;
}

export interface CopilotScanResult {
  source: SourceStatus;
  sessions: NormalizedUsage[];
  stats: CopilotScanStats;
}

export interface CopilotScanStats {
  sourceId: "copilot";
  sourceLabel: "GitHub Copilot";
  homePath: string;
  copilotHome: string;
  otelPath: string;
  workspaceStoragePath: string;
  otelExists: boolean;
  sessionsExists: boolean;
  sessionFileCount: number;
  otelFileCount: number;
  debugLogFileCount: number;
  transcriptFileCount: number;
  sessionStateFileCount: number;
  sessionsImported: number;
  parseFailureCount: number;
  unreadableFileCount: number;
  malformedFileCount: number;
  lastScannedAt: string;
}

interface CopilotFile {
  filePath: string;
  kind: "otel" | "debug" | "transcript" | "session_state";
  surface: CopilotSurface;
  fallbackCwd: string | undefined;
}

interface CopilotDiscovery {
  otelPath: string;
  workspaceStoragePath: string;
  files: CopilotFile[];
  codeUserRoots: string[];
  modelHints: Map<string, CopilotModelHint>;
  warnings: string[];
}

interface CopilotModelHint {
  model: string;
  sourcePath: string;
}

interface CopilotFileReadResult {
  breakdowns: CopilotSessionBreakdown[];
  stats: CopilotFileReadStats;
}

interface CopilotFileReadStats {
  parseFailed: boolean;
  unreadable: boolean;
  malformed: boolean;
}

interface TraceContext {
  model: string | undefined;
  sessionId: string | undefined;
  sessionPriority: number;
}

interface CopilotUsageCandidate {
  source: CopilotUsageSource;
  traceId: string | undefined;
  responseId: string | undefined;
  sessionId: string;
  model: string | undefined;
  timestamp: string | undefined;
  durationMs: number | undefined;
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  dedupKey: string;
}

interface CopilotTokenEvent {
  dedupKey: string;
  detailed: boolean;
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

interface CopilotSessionBreakdown {
  id: string | undefined;
  title: string | undefined;
  cwd: string | undefined;
  startedAt: string | undefined;
  endedAt: string | undefined;
  model: string | undefined;
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  usageCount: number;
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
  sourcePaths: string[];
  surface: CopilotSurface;
  tokenEvents: CopilotTokenEvent[];
}

export function scanCopilot(options: CopilotAdapterOptions): CopilotScanResult {
  const copilotHome = options.copilotHome ?? path.join(os.homedir(), ".copilot");
  const discovery = discoverCopilotFiles(copilotHome, Boolean(options.copilotHome), options.codeUserRoots);
  const files = discovery.files.filter((file) => fileMayOverlapScanWindow(file.filePath, options.scanWindow));
  const sessionMap = new Map<string, CopilotSessionBreakdown>();
  const fileStats: CopilotFileReadStats[] = [];

  for (const [index, file] of files.entries()) {
    const read = readCopilotFile(file, index);
    fileStats.push(read.stats);
    for (const breakdown of read.breakdowns) {
      mergeBreakdown(sessionMap, breakdown);
    }
  }
  applyModelHints(sessionMap, discovery.modelHints);

  const sessions = [...sessionMap.values()]
    .sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""))
    .map((breakdown, index) => breakdownToUsage(breakdown, index, options));
  const parseFailureCount = fileStats.filter((stats) => stats.parseFailed).length;
  const unreadableFileCount = fileStats.filter((stats) => stats.unreadable).length;
  const malformedFileCount = fileStats.filter((stats) => stats.malformed).length;

  if (!fs.existsSync(copilotHome)) discovery.warnings.push(`GitHub Copilot home directory not found at ${copilotHome}`);
  if (!fs.existsSync(discovery.otelPath)) discovery.warnings.push(`GitHub Copilot OpenTelemetry directory not found at ${discovery.otelPath}`);

  const otelFiles = files.filter((file) => file.kind === "otel").length;
  const debugLogFiles = files.filter((file) => file.kind === "debug").length;
  const transcriptFiles = files.filter((file) => file.kind === "transcript").length;
  const sessionStateFiles = files.filter((file) => file.kind === "session_state").length;

  return {
    source: {
      id: "copilot",
      label: "GitHub Copilot",
      available: files.length > 0,
      paths: unique([copilotHome, discovery.otelPath, discovery.workspaceStoragePath, ...discovery.codeUserRoots, ...files.map((file) => file.filePath), ...[...discovery.modelHints.values()].map((hint) => hint.sourcePath)]),
      warnings: discovery.warnings,
    },
    sessions,
    stats: {
      sourceId: "copilot",
      sourceLabel: "GitHub Copilot",
      homePath: copilotHome,
      copilotHome,
      otelPath: discovery.otelPath,
      workspaceStoragePath: discovery.workspaceStoragePath,
      otelExists: fs.existsSync(discovery.otelPath),
      sessionsExists: files.length > 0,
      sessionFileCount: files.length,
      otelFileCount: otelFiles,
      debugLogFileCount: debugLogFiles,
      transcriptFileCount: transcriptFiles,
      sessionStateFileCount: sessionStateFiles,
      sessionsImported: sessions.length,
      parseFailureCount,
      unreadableFileCount,
      malformedFileCount,
      lastScannedAt: new Date().toISOString(),
    },
  };
}

function discoverCopilotFiles(copilotHome: string, explicitHome: boolean, explicitCodeUserRoots: string[] | undefined): CopilotDiscovery {
  const warnings: string[] = [];
  const otelPath = path.join(copilotHome, "otel");
  const codeUserRoots = explicitCodeUserRoots ?? (explicitHome ? [] : defaultCodeUserRoots());
  const workspaceStoragePath = codeUserRoots[0] ? path.join(codeUserRoots[0], "workspaceStorage") : "";
  const files: CopilotFile[] = [];
  const modelHints = new Map<string, CopilotModelHint>();

  collectJsonlFiles(otelPath, "otel", "cli", undefined, files, warnings);
  collectCopilotSessionStateFiles(copilotHome, files, warnings);
  const explicitOtelPath = process.env[copilotOtelEnv]?.trim();
  if (explicitOtelPath && isReadableRegularFile(explicitOtelPath, maxJsonlBytes)) {
    files.push({ filePath: path.resolve(explicitOtelPath), kind: "otel", surface: "cli", fallbackCwd: undefined });
  }

  for (const userRoot of codeUserRoots) {
    collectCodeCopilotFiles(userRoot, files, modelHints, warnings);
  }

  return {
    otelPath,
    workspaceStoragePath,
    files: uniqueFiles(files),
    codeUserRoots,
    modelHints,
    warnings,
  };
}

function collectCopilotSessionStateFiles(copilotHome: string, files: CopilotFile[], warnings: string[]): void {
  const sessionStateRoot = path.join(copilotHome, "session-state");
  if (!fs.existsSync(sessionStateRoot)) return;
  try {
    for (const entry of fs.readdirSync(sessionStateRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sessionDir = path.join(sessionStateRoot, entry.name);
      const eventsPath = path.join(sessionDir, "events.jsonl");
      if (isReadableRegularFile(eventsPath, maxJsonlBytes)) {
        files.push({ filePath: eventsPath, kind: "session_state", surface: "cli", fallbackCwd: cwdFromWorkspaceYaml(path.join(sessionDir, "workspace.yaml")) });
      }
    }
  } catch (error) {
    warnings.push(`Unable to read GitHub Copilot session state at ${sessionStateRoot}: ${errorMessage(error)}`);
  }
}

function collectCodeCopilotFiles(userRoot: string, files: CopilotFile[], modelHints: Map<string, CopilotModelHint>, warnings: string[]): void {
  const workspaceStorage = path.join(userRoot, "workspaceStorage");
  if (!fs.existsSync(workspaceStorage)) return;
  try {
    for (const workspace of fs.readdirSync(workspaceStorage, { withFileTypes: true })) {
      if (!workspace.isDirectory()) continue;
      const workspaceRoot = path.join(workspaceStorage, workspace.name);
      const copilotRoot = path.join(workspaceRoot, "GitHub.copilot-chat");
      if (!fs.existsSync(copilotRoot)) continue;
      const fallbackCwd = workspaceFolderFromStorageJson(path.join(workspaceRoot, "workspace.json"));
      collectJsonlFiles(path.join(copilotRoot, "debug-logs"), "debug", "vscode", fallbackCwd, files, warnings);
      collectJsonlFiles(path.join(copilotRoot, "transcripts"), "transcript", "vscode", fallbackCwd, files, warnings);
      collectCodeChatSessionModelHints(path.join(workspaceRoot, "chatSessions"), modelHints, warnings);
    }
  } catch (error) {
    warnings.push(`Unable to read GitHub Copilot VS Code storage at ${workspaceStorage}: ${errorMessage(error)}`);
  }
}

function collectCodeChatSessionModelHints(root: string, modelHints: Map<string, CopilotModelHint>, warnings: string[]): void {
  if (!fs.existsSync(root)) return;
  try {
    walk(root, 2, (filePath) => {
      if (!filePath.endsWith(".jsonl") || !isReadableRegularFile(filePath, maxJsonlBytes)) return;
      const hint = readCodeChatSessionModelHint(filePath);
      if (hint) modelHints.set(hint.sessionId, { model: hint.model, sourcePath: filePath });
    });
  } catch (error) {
    warnings.push(`Unable to read VS Code chat session metadata at ${root}: ${errorMessage(error)}`);
  }
}

function readCodeChatSessionModelHint(filePath: string): { sessionId: string; model: string } | undefined {
  const fallbackSessionId = path.basename(filePath).replace(/\.jsonl$/i, "");
  let sessionId = fallbackSessionId;
  let model: string | undefined;
  try {
    for (const record of parseJsonLines(fs.readFileSync(filePath, "utf8")).records) {
      const body = firstObject(record.v) ?? firstObject(record.data) ?? record;
      const metadata = firstObject(body.metadata);
      sessionId = stringValue(body.sessionId) ?? stringValue(metadata?.sessionId) ?? sessionId;
      model = chatSessionSelectedModel(body) ?? chatSessionResolvedModel(body) ?? model;
    }
  } catch {
    return undefined;
  }
  return sessionId && model ? { sessionId, model } : undefined;
}

function chatSessionSelectedModel(body: Record<string, unknown>): string | undefined {
  const inputState = firstObject(body.inputState);
  const selectedModel = firstObject(inputState?.selectedModel) ?? firstObject(body.selectedModel);
  const metadata = firstObject(selectedModel?.metadata);
  return firstModelCandidate([
    stringValue(metadata?.version),
    stringValue(metadata?.family),
    stringValue(selectedModel?.id),
    stringValue(selectedModel?.identifier),
  ]);
}

function chatSessionResolvedModel(body: Record<string, unknown>): string | undefined {
  const metadata = firstObject(body.metadata);
  const response = firstObject(body.response);
  const responseMetadata = firstObject(response?.metadata);
  return firstModelCandidate([
    stringValue(metadata?.resolvedModel),
    stringValue(responseMetadata?.resolvedModel),
  ]);
}

function firstModelCandidate(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const normalized = value?.replace(/^github[-_]?copilot\//i, "").replace(/^copilot\//i, "").trim();
    if (normalized && normalized.toLowerCase() !== "auto") return normalized;
  }
  return undefined;
}

function collectJsonlFiles(root: string, kind: CopilotFile["kind"], surface: CopilotSurface, fallbackCwd: string | undefined, files: CopilotFile[], warnings: string[]): void {
  if (!fs.existsSync(root)) return;
  try {
    walk(root, 6, (filePath) => {
      if (filePath.endsWith(".jsonl") && isReadableRegularFile(filePath, maxJsonlBytes)) {
        files.push({ filePath, kind, surface, fallbackCwd });
      }
    });
  } catch (error) {
    warnings.push(`Unable to read GitHub Copilot path ${root}: ${errorMessage(error)}`);
  }
}

function readCopilotFile(file: CopilotFile, index: number): CopilotFileReadResult {
  const fallbackId = path.basename(file.filePath).replace(/\.jsonl$/i, "") || `copilot-session-${index}`;
  const fallbackTimestamp = fileModifiedDate(file.filePath);
  const fallback = emptyBreakdown(file, fallbackId);
  try {
    const parse = parseJsonLines(fs.readFileSync(file.filePath, "utf8"));
    const traceContexts = collectTraceContexts(parse.records);
    const candidates = parse.records
      .map((record, recordIndex) => usageCandidateFromRecord(record, recordIndex, fallbackTimestamp, traceContexts))
      .filter((candidate): candidate is CopilotUsageCandidate => Boolean(candidate));
    const selectedCandidates = uniqueCandidates(candidates.filter((candidate) => shouldEmitCandidate(candidate, candidates)));
    const groups = new Map<string, CopilotSessionBreakdown>();

    fallback.rawEventCount = parse.records.length;
    fallback.parseErrors = parse.errors;
    fallback.parseStatus = parse.errors.length ? (parse.records.length ? "partial" : "failed") : "ok";
    if (file.kind === "transcript" || file.kind === "session_state") {
      for (const record of parse.records) applyTranscriptRecord(fallback, record, file, file.kind === "transcript" ? fallbackTimestamp : undefined);
    }

    for (const candidate of selectedCandidates) {
      const group = groups.get(candidate.sessionId) ?? emptyBreakdown(file, candidate.sessionId);
      group.rawEventCount = parse.records.length;
      group.parseErrors = parse.errors;
      group.parseStatus = parse.errors.length ? "partial" : "ok";
      applyCandidate(group, candidate);
      groups.set(candidate.sessionId, group);
    }

    const stats = statsFromParseErrors(parse.errors);
    if (groups.size > 0) {
      return { breakdowns: [...groups.values()].map((group) => mergeActivity(group, fallback)), stats };
    }
    if (fallback.messageCount > 0 || fallback.rawEventCount > 0 || fallback.parseErrors.length > 0) return { breakdowns: [fallbackWithMissingTokenWarning(fallback)], stats };
    return { breakdowns: [], stats };
  } catch (error) {
    const breakdown = emptyBreakdown(file, fallbackId);
    const message = `unable_to_read_copilot_file:${errorMessage(error)}`;
    breakdown.parseStatus = "failed";
    breakdown.parseErrors.push(message);
    breakdown.warnings.push(message);
    return { breakdowns: [breakdown], stats: { parseFailed: true, unreadable: true, malformed: false } };
  }
}

function statsFromParseErrors(errors: string[]): CopilotFileReadStats {
  return { parseFailed: errors.length > 0, unreadable: false, malformed: errors.some((error) => error.startsWith("jsonl_line_")) };
}

function collectTraceContexts(records: Array<Record<string, unknown>>): Map<string, TraceContext> {
  const contexts = new Map<string, TraceContext>();
  for (const record of records) {
    const traceId = traceIdFromRecord(record);
    const attributes = firstObject(record.attributes);
    if (!traceId || !attributes) continue;
    const context = contexts.get(traceId) ?? { model: undefined, sessionId: undefined, sessionPriority: 0 };
    context.model ??= firstNonEmptyAttr(attributes, modelAttrs);
    const session = bestSessionAttr(attributes);
    if (session && session.priority > context.sessionPriority) {
      context.sessionId = session.value;
      context.sessionPriority = session.priority;
    }
    contexts.set(traceId, context);
  }
  return contexts;
}

function usageCandidateFromRecord(record: Record<string, unknown>, index: number, fallbackTimestamp: string | undefined, traceContexts: Map<string, TraceContext>): CopilotUsageCandidate | undefined {
  const attributes = firstObject(record.attributes);
  if (!attributes) return undefined;
  const source = usageSource(record, attributes);
  if (!source) return undefined;

  const input = numberValue(attributes["gen_ai.usage.input_tokens"]);
  const output = numberValue(attributes["gen_ai.usage.output_tokens"]);
  const cached = numberValue(attributes["gen_ai.usage.cache_read.input_tokens"]);
  const cacheCreation = firstPositiveNumber(attributes, ["gen_ai.usage.cache_write.input_tokens", "gen_ai.usage.cache_creation.input_tokens"]);
  const reasoning = firstPositiveNumber(attributes, ["gen_ai.usage.reasoning.output_tokens", "gen_ai.usage.reasoning_tokens"]);
  const total = firstPositiveNumber(attributes, ["gen_ai.usage.total_tokens", "gen_ai.usage.total.token_count"]);
  const outputWithFallback = output || outputTokensFromTotal(total, input, reasoning);
  if (input + outputWithFallback + cached + cacheCreation + reasoning <= 0) return undefined;

  const traceId = traceIdFromRecord(record);
  const traceContext = traceId ? traceContexts.get(traceId) : undefined;
  const session = bestSessionAttr(attributes)?.value ?? traceContext?.sessionId ?? traceId ?? "unknown-session";
  const timestamp = timestampFromRecord(record) ?? fallbackTimestamp;
  return {
    source,
    traceId,
    responseId: stringValue(attributes["gen_ai.response.id"]),
    sessionId: session,
    model: firstNonEmptyAttr(attributes, modelAttrs) ?? traceContext?.model,
    timestamp,
    durationMs: durationMsFromRecord(record),
    inputTokens: input,
    cachedInputTokens: cached,
    cacheCreationInputTokens: cacheCreation,
    outputTokens: outputWithFallback,
    reasoningTokens: reasoning,
    dedupKey: dedupKeyForRecord(source, record, attributes, traceId, session, timestamp, index),
  };
}

function outputTokensFromTotal(total: number, input: number, reasoning: number): number {
  // OpenTelemetry GenAI totals follow API semantics here: cached input is a subset of input,
  // not an extra bucket. If a future Copilot surface reports additive cached totals, avoid
  // inferring output from an impossible total instead of overstating usage.
  return total > 0 && total >= input + reasoning ? total - input - reasoning : 0;
}

function usageSource(record: Record<string, unknown>, attributes: Record<string, unknown>): CopilotUsageSource | undefined {
  const operation = stringValue(attributes["gen_ai.operation.name"]);
  const eventName = stringValue(attributes["event.name"]);
  const name = stringValue(record.name);
  const body = stringValue(record.body) ?? stringValue(record._body);
  const span = isSpanRecord(record);
  if (span && (operation === "chat" || name?.startsWith("chat "))) return "chat_span";
  if (!span && (eventName === "gen_ai.client.inference.operation.details" || body?.startsWith("GenAI inference:"))) return "inference_log";
  if (!span && (eventName === "copilot_chat.agent.turn" || body?.startsWith("copilot_chat.agent.turn"))) return "agent_turn_log";
  if (span && (operation === "invoke_agent" || name?.startsWith("invoke_agent "))) return "agent_summary_span";
  return undefined;
}

function isSpanRecord(record: Record<string, unknown>): boolean {
  const type = stringValue(record.type);
  if (type) return type === "span";
  return Boolean(stringValue(record.name) && (stringValue(record.spanId) || stringValue(record.traceId) || record.startTime || record.endTime || record.duration || record.kind));
}

function shouldEmitCandidate(candidate: CopilotUsageCandidate, candidates: CopilotUsageCandidate[]): boolean {
  const has = (source: CopilotUsageSource, field: "traceId" | "responseId", value: string | undefined) => Boolean(value && candidates.some((item) => item.source === source && item[field] === value));
  if (candidate.source === "chat_span") return true;
  if (candidate.source === "inference_log") return !has("chat_span", "traceId", candidate.traceId) && !has("chat_span", "responseId", candidate.responseId);
  if (candidate.source === "agent_turn_log") {
    return !has("chat_span", "traceId", candidate.traceId) && !has("inference_log", "traceId", candidate.traceId) && !has("chat_span", "responseId", candidate.responseId) && !has("inference_log", "responseId", candidate.responseId);
  }
  return !has("chat_span", "traceId", candidate.traceId) && !has("inference_log", "traceId", candidate.traceId) && !has("agent_turn_log", "traceId", candidate.traceId) && !has("chat_span", "responseId", candidate.responseId) && !has("inference_log", "responseId", candidate.responseId) && !has("agent_turn_log", "responseId", candidate.responseId);
}

function uniqueCandidates(candidates: CopilotUsageCandidate[]): CopilotUsageCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.dedupKey)) return false;
    seen.add(candidate.dedupKey);
    return true;
  });
}

const modelAttrs = ["gen_ai.response.model", "gen_ai.request.model"];
const sessionAttrs: Array<{ key: string; priority: number }> = [
  { key: "gen_ai.conversation.id", priority: 3 },
  { key: "copilot_chat.session_id", priority: 3 },
  { key: "copilot_chat.chat_session_id", priority: 3 },
  { key: "session.id", priority: 3 },
  { key: "github.copilot.interaction_id", priority: 2 },
  { key: "gen_ai.response.id", priority: 1 },
];

function applyCandidate(breakdown: CopilotSessionBreakdown, candidate: CopilotUsageCandidate): void {
  breakdown.id = candidate.sessionId;
  breakdown.model = candidate.model ?? breakdown.model;
  const candidateStartedAt = candidate.timestamp && candidate.durationMs ? new Date(Date.parse(candidate.timestamp) - candidate.durationMs).toISOString() : candidate.timestamp;
  breakdown.startedAt = minDate(breakdown.startedAt, candidateStartedAt);
  breakdown.endedAt = maxDate(breakdown.endedAt, candidate.timestamp);
  applyTokenEvent(breakdown, {
    dedupKey: candidate.dedupKey,
    detailed: candidate.inputTokens > 0 || candidate.cachedInputTokens > 0 || candidate.cacheCreationInputTokens > 0 || candidate.reasoningTokens > 0,
    inputTokens: candidate.inputTokens,
    cachedInputTokens: candidate.cachedInputTokens,
    cacheCreationInputTokens: candidate.cacheCreationInputTokens,
    outputTokens: candidate.outputTokens,
    reasoningTokens: candidate.reasoningTokens,
  });
  breakdown.messageCount += 1;
  breakdown.assistantMessageCount += 1;
}

function applyTranscriptRecord(breakdown: CopilotSessionBreakdown, record: Record<string, unknown>, file: CopilotFile, fallbackTimestamp: string | undefined): void {
  const data = firstObject(record.data);
  const timestamp = dateValue(record.timestamp) ?? dateValue(record.ts) ?? dateValue(data?.startTime) ?? fallbackTimestamp;
  const type = stringValue(record.type);
  const role = type?.startsWith("user.") ? "user" : type?.startsWith("assistant.") ? "assistant" : stringValue(data?.role);
  const sessionId = stringValue(data?.sessionId) ?? stringValue(record.sessionId) ?? stringValue(record.sid);
  if (sessionId) breakdown.id = sessionId;
  if (timestamp) {
    breakdown.startedAt = minDate(breakdown.startedAt, timestamp);
    breakdown.endedAt = maxDate(breakdown.endedAt, timestamp);
  }
  breakdown.cwd ??= stringValue(data?.cwd) ?? stringValue(record.cwd) ?? file.fallbackCwd;
  const context = firstObject(data?.context);
  breakdown.cwd ??= stringValue(context?.cwd) ?? stringValue(context?.gitRoot);
  const modelCandidate = stringValue(data?.newModel) ?? stringValue(data?.currentModel) ?? stringValue(data?.model) ?? stringValue(record.model);
  if (modelCandidate && (modelCandidate !== "auto" || !breakdown.model)) breakdown.model = modelCandidate;
  if (type === "session.start") breakdown.title ??= stringValue(data?.title);
  const outputTokens = numberValue(data?.outputTokens);
  if (outputTokens > 0) {
    const partialSessionId = sessionId ?? breakdown.id ?? path.basename(file.filePath);
    applyTokenEvent(breakdown, {
      dedupKey: `transcript-output:${file.filePath}:${partialSessionId}:${timestamp ?? "unknown"}:${breakdown.usageCount}`,
      detailed: false,
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheCreationInputTokens: 0,
      outputTokens,
      reasoningTokens: 0,
    });
  }
  if (role === "user" || role === "assistant") {
    breakdown.messageCount += 1;
    if (role === "user") breakdown.userPromptCount += 1;
    if (role === "assistant") breakdown.assistantMessageCount += 1;
    applyTimeline(breakdown, role, data?.content ?? record.content, timestamp);
  }
  const toolRequests = Array.isArray(data?.toolRequests) ? data.toolRequests : [];
  breakdown.toolCallCount += toolRequests.length;
  for (const request of toolRequests) {
    const object = firstObject(request);
    const name = stringValue(object?.name)?.toLowerCase() ?? "";
    const args = stringValue(object?.arguments)?.toLowerCase() ?? "";
    if (name.includes("terminal") || args.includes("\"command\"")) breakdown.shellCommandCount += 1;
    if (name.includes("edit") || args.includes("edit")) breakdown.fileEditCount += 1;
    if (name.includes("read") || args.includes("read_file")) breakdown.fileReadCount += 1;
  }
}

function breakdownToUsage(breakdown: CopilotSessionBreakdown, index: number, options: CopilotAdapterOptions): NormalizedUsage {
  const id = breakdown.id ?? `copilot-session-${index}`;
  const cwd = breakdown.cwd ?? "";
  const repo = breakdown.cwd ? resolveRepoInfo(breakdown.cwd, options.config) : unknownCopilotRepoInfo();
  const hasTokenBreakdown = breakdown.inputTokens + breakdown.outputTokens + breakdown.reasoningTokens > 0 && breakdown.usageCount > 0;
  const hasPricedBreakdown = hasTokenBreakdown && breakdown.inputTokens > 0;
  const warnings = unique([...repo.warnings, ...breakdown.warnings]);
  if (hasTokenBreakdown && !hasPricedBreakdown) warnings.push("copilot_partial_token_breakdown");
  const usage: NormalizedUsage = {
    id,
    sourceClient: "copilot",
    sourceApp: breakdown.surface === "cli" ? "Copilot CLI" : breakdown.surface === "vscode" ? "VS Code" : "GitHub Copilot",
    sourceAppRaw: breakdown.surface,
    sourcePath: breakdown.sourcePaths[0] ?? "",
    repoRoot: repo.repoRoot,
    repoName: repo.repoName,
    cwd,
    gitRemoteUrl: repo.gitRemoteUrl,
    gitBranch: repo.gitBranch,
    title: breakdown.title,
    startedAt: breakdown.startedAt,
    endedAt: breakdown.endedAt,
    model: normalizeCopilotModel(breakdown.model),
    provider: providerFromModel(breakdown.model),
    inputTokens: breakdown.inputTokens,
    cachedInputTokens: breakdown.cachedInputTokens,
    cacheCreationInputTokens: breakdown.cacheCreationInputTokens,
    outputTokens: breakdown.outputTokens,
    reasoningTokens: breakdown.reasoningTokens,
    reasoningOutputTokens: breakdown.reasoningTokens,
    totalTokens: breakdown.inputTokens + breakdown.outputTokens + breakdown.reasoningTokens,
    tokenAggregationMethod: hasTokenBreakdown ? "direct_usage" : "unknown",
    tokenConfidence: hasTokenBreakdown ? "high" : "low",
    tokenSnapshotCount: breakdown.usageCount,
    estimatedCostUsd: undefined,
    messageCount: breakdown.messageCount,
    rawTokenTotal: hasTokenBreakdown ? breakdown.inputTokens + breakdown.outputTokens + breakdown.reasoningTokens : undefined,
    warnings: hasTokenBreakdown ? warnings : unique([...warnings, "missing_token_breakdown"]),
    durationMs: durationMs(breakdown.startedAt, breakdown.endedAt),
    rawEventCount: breakdown.rawEventCount,
    parseStatus: breakdown.parseStatus,
    parseErrors: breakdown.parseErrors,
    detectedSurface: breakdown.surface === "vscode" ? "vscode_extension" : "terminal_cli",
    surfaceConfidence: breakdown.surface === "unknown" ? "low" : "high",
    surfaceReason: breakdown.surface === "vscode" ? "GitHub Copilot VS Code workspace storage" : "GitHub Copilot OpenTelemetry export",
    promptTimeline: breakdown.promptTimeline,
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
    sourceMetadata: { copilot: { sourcePaths: breakdown.sourcePaths, surface: breakdown.surface } },
  };
  const cost = hasPricedBreakdown ? calculateCostUsd(usage, options.pricing) : undefined;
  return { ...usage, estimatedCostUsd: cost, warnings: hasPricedBreakdown && cost === undefined ? [...usage.warnings, "unknown_pricing"] : usage.warnings };
}

function unknownCopilotRepoInfo() {
  return {
    repoRoot: "unknown-copilot-repo",
    repoName: "Unknown repo/folder",
    gitRemoteUrl: undefined,
    gitBranch: undefined,
    warnings: ["repo_unverified_no_git_root", "copilot_missing_cwd"],
  };
}

function emptyBreakdown(file: CopilotFile, id: string | undefined): CopilotSessionBreakdown {
  return {
    id,
    title: undefined,
    cwd: file.fallbackCwd,
    startedAt: undefined,
    endedAt: undefined,
    model: undefined,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
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
    sourcePaths: [file.filePath],
    surface: file.surface,
    tokenEvents: [],
  };
}

function mergeBreakdown(sessions: Map<string, CopilotSessionBreakdown>, breakdown: CopilotSessionBreakdown): void {
  const key = breakdown.id ?? breakdown.sourcePaths[0] ?? "unknown-session";
  const existing = sessions.get(key);
  if (!existing) {
    sessions.set(key, breakdown);
    return;
  }
  mergeActivity(existing, breakdown);
  mergeTokenData(existing, breakdown);
  existing.sourcePaths = unique([...existing.sourcePaths, ...breakdown.sourcePaths]);
}

function mergeTokenData(target: CopilotSessionBreakdown, source: CopilotSessionBreakdown): void {
  if (source.usageCount <= 0) return;
  const targetHadUsage = target.usageCount > 0;
  const targetHasDetailed = hasDetailedTokenBreakdown(target);
  const sourceHasDetailed = hasDetailedTokenBreakdown(source);
  if (targetHadUsage) target.warnings = unique([...target.warnings, "copilot_duplicate_session_merged"]);
  if (targetHadUsage && targetHasDetailed && !sourceHasDetailed) return;
  if (targetHadUsage && !targetHasDetailed && sourceHasDetailed) {
    replaceTokenData(target, source);
    return;
  }
  if (source.tokenEvents.length > 0) {
    const existingKeys = new Set(target.tokenEvents.map((event) => event.dedupKey));
    for (const event of source.tokenEvents) {
      if (existingKeys.has(event.dedupKey)) continue;
      applyTokenEvent(target, event);
      existingKeys.add(event.dedupKey);
    }
    return;
  }
  applyTokenEvent(target, {
    dedupKey: `merged-total:${source.sourcePaths.join("|")}:${source.usageCount}`,
    detailed: sourceHasDetailed,
    inputTokens: source.inputTokens,
    cachedInputTokens: source.cachedInputTokens,
    cacheCreationInputTokens: source.cacheCreationInputTokens,
    outputTokens: source.outputTokens,
    reasoningTokens: source.reasoningTokens,
  });
}

function replaceTokenData(target: CopilotSessionBreakdown, source: CopilotSessionBreakdown): void {
  target.inputTokens = source.inputTokens;
  target.cachedInputTokens = source.cachedInputTokens;
  target.cacheCreationInputTokens = source.cacheCreationInputTokens;
  target.outputTokens = source.outputTokens;
  target.reasoningTokens = source.reasoningTokens;
  target.usageCount = source.usageCount;
  target.tokenEvents = source.tokenEvents.map((event) => ({ ...event }));
}

function hasDetailedTokenBreakdown(breakdown: CopilotSessionBreakdown): boolean {
  return breakdown.inputTokens > 0 || breakdown.cachedInputTokens > 0 || breakdown.cacheCreationInputTokens > 0 || breakdown.reasoningTokens > 0;
}

function applyTokenEvent(breakdown: CopilotSessionBreakdown, event: CopilotTokenEvent): void {
  if (breakdown.tokenEvents.some((existing) => existing.dedupKey === event.dedupKey)) return;
  breakdown.inputTokens += event.inputTokens;
  breakdown.cachedInputTokens += event.cachedInputTokens;
  breakdown.cacheCreationInputTokens += event.cacheCreationInputTokens;
  breakdown.outputTokens += event.outputTokens;
  breakdown.reasoningTokens += event.reasoningTokens;
  breakdown.usageCount += 1;
  breakdown.tokenEvents.push({ ...event });
}

function applyModelHints(sessions: Map<string, CopilotSessionBreakdown>, modelHints: Map<string, CopilotModelHint>): void {
  for (const breakdown of sessions.values()) {
    if (!breakdown.id) continue;
    const hint = modelHints.get(breakdown.id);
    if (!hint || hasKnownModel(breakdown.model)) continue;
    breakdown.model = hint.model;
    breakdown.sourcePaths = unique([...breakdown.sourcePaths, hint.sourcePath]);
  }
}

function hasKnownModel(model: string | undefined): boolean {
  const normalized = model?.trim().toLowerCase().replace(/^github[-_]?copilot\//, "").replace(/^copilot\//, "");
  return Boolean(normalized && normalized !== "auto");
}

function mergeActivity(target: CopilotSessionBreakdown, source: CopilotSessionBreakdown): CopilotSessionBreakdown {
  target.title ??= source.title;
  target.cwd ??= source.cwd;
  target.model ??= source.model;
  target.startedAt = minDate(target.startedAt, source.startedAt);
  target.endedAt = maxDate(target.endedAt, source.endedAt);
  target.messageCount = Math.max(target.messageCount, source.messageCount);
  target.userPromptCount = Math.max(target.userPromptCount, source.userPromptCount);
  target.assistantMessageCount = Math.max(target.assistantMessageCount, source.assistantMessageCount);
  target.toolCallCount = Math.max(target.toolCallCount, source.toolCallCount);
  target.shellCommandCount = Math.max(target.shellCommandCount, source.shellCommandCount);
  target.fileReadCount = Math.max(target.fileReadCount, source.fileReadCount);
  target.fileEditCount = Math.max(target.fileEditCount, source.fileEditCount);
  target.rawEventCount = Math.max(target.rawEventCount, source.rawEventCount);
  target.parseErrors = unique([...target.parseErrors, ...source.parseErrors]);
  target.parseStatus = target.parseErrors.length ? "partial" : target.parseStatus;
  target.promptTimeline = [...target.promptTimeline, ...source.promptTimeline].slice(0, 80);
  target.warnings = unique([...target.warnings, ...source.warnings]);
  return target;
}

function fallbackWithMissingTokenWarning(breakdown: CopilotSessionBreakdown): CopilotSessionBreakdown {
  if (breakdown.usageCount === 0) breakdown.warnings.push("missing_token_breakdown");
  return breakdown;
}

function parseJsonLines(text: string): { records: Array<Record<string, unknown>>; errors: string[] } {
  const records: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) records.push(parsed as Record<string, unknown>);
    } catch (error) {
      errors.push(`jsonl_line_${index + 1}:${errorMessage(error)}`);
    }
  });
  return { records, errors };
}

function applyTimeline(breakdown: CopilotSessionBreakdown, role: "user" | "assistant", content: unknown, timestamp: string | undefined): void {
  if (breakdown.promptTimeline.length >= 80) return;
  const text = typeof content === "string" ? content : undefined;
  if (!text?.trim()) return;
  breakdown.promptTimeline.push({ role, text: text.replace(/\s+/g, " ").trim().slice(0, 1000), timestamp });
}

function firstNonEmptyAttr(attributes: Record<string, unknown>, keys: string[]): string | undefined {
  return keys.map((key) => stringValue(attributes[key])).find(Boolean);
}

function bestSessionAttr(attributes: Record<string, unknown>): { value: string; priority: number } | undefined {
  return sessionAttrs
    .map((attr) => ({ value: stringValue(attributes[attr.key]), priority: attr.priority }))
    .filter((item): item is { value: string; priority: number } => Boolean(item.value))
    .sort((a, b) => b.priority - a.priority)[0];
}

function traceIdFromRecord(record: Record<string, unknown>): string | undefined {
  const spanContext = firstObject(record.spanContext);
  return stringValue(record.traceId) ?? stringValue(spanContext?.traceId);
}

function spanIdFromRecord(record: Record<string, unknown>): string | undefined {
  const spanContext = firstObject(record.spanContext);
  return stringValue(record.spanId) ?? stringValue(spanContext?.spanId);
}

function dedupKeyForRecord(source: CopilotUsageSource, record: Record<string, unknown>, attributes: Record<string, unknown>, traceId: string | undefined, sessionId: string, timestamp: string | undefined, index: number): string {
  const spanId = spanIdFromRecord(record);
  if ((source === "chat_span" || source === "agent_summary_span") && traceId && spanId) return `${traceId}:${spanId}`;
  if (source === "inference_log" && traceId && spanId) return `log:${traceId}:${spanId}`;
  if (source === "agent_turn_log") {
    const turn = stringValue(attributes["turn.index"]) ?? stringValue(attributes["copilot_chat.turn.index"]) ?? `idx-${index}`;
    return traceId ? `agent-turn:${traceId}:${turn}` : `agent-turn:${sessionId}:${turn}:${index}`;
  }
  return `${source}:${sessionId}:${timestamp ?? "unknown"}:${index}`;
}

function timestampFromRecord(record: Record<string, unknown>): string | undefined {
  return timestampMsFromParts(record.endTime) ?? timestampMsFromParts(record.startTime) ?? timestampMsFromParts(record.hrTime) ?? timestampMsFromParts(record._hrTime) ?? timestampMsFromScalar(record.timestamp) ?? timestampMsFromScalar(record.observedTimestamp) ?? timestampMsFromUnixNanos(record.timeUnixNano);
}

function timestampMsFromParts(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const seconds = numberValue(value[0]);
  const nanos = numberValue(value[1]);
  if (seconds <= 0) return undefined;
  return new Date(seconds * 1000 + Math.floor(nanos / 1_000_000)).toISOString();
}

function timestampMsFromScalar(value: unknown): string | undefined {
  const raw = numberValue(value);
  if (raw <= 0) return undefined;
  const absolute = Math.abs(raw);
  const ms = absolute >= 100_000_000_000_000_000 ? raw / 1_000_000 : absolute >= 100_000_000_000_000 ? raw / 1_000 : absolute >= 100_000_000_000 ? raw : raw * 1000;
  return new Date(ms).toISOString();
}

function timestampMsFromUnixNanos(value: unknown): string | undefined {
  const raw = numberValue(value);
  return raw > 0 ? new Date(Math.floor(raw / 1_000_000)).toISOString() : undefined;
}

function durationMsFromRecord(record: Record<string, unknown>): number | undefined {
  const start = timestampMs(record.startTime);
  const end = timestampMs(record.endTime);
  if (start !== undefined && end !== undefined && end > start) return end - start;
  const duration = numberValue(record.duration);
  return duration > 0 ? (duration >= 1_000_000 ? Math.floor(duration / 1_000_000) : duration) : undefined;
}

function timestampMs(value: unknown): number | undefined {
  const iso = timestampMsFromParts(value) ?? timestampMsFromScalar(value);
  return iso ? Date.parse(iso) : undefined;
}

function defaultCodeUserRoots(): string[] {
  const home = os.homedir();
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    return ["Code", "Code - Insiders", "VSCodium"].map((name) => path.join(appData, name, "User"));
  }
  if (process.platform === "darwin") {
    return ["Code", "Code - Insiders", "VSCodium"].map((name) => path.join(home, "Library", "Application Support", name, "User"));
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return ["Code", "Code - Insiders", "VSCodium"].map((name) => path.join(xdg, name, "User"));
}

function workspaceFolderFromStorageJson(filePath: string): string | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const folder = stringValue(parsed.folder);
    if (!folder) return undefined;
    return folder.startsWith("file://") ? decodeURIComponent(new URL(folder).pathname) : folder;
  } catch {
    return undefined;
  }
}

function cwdFromWorkspaceYaml(filePath: string): string | undefined {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const match = /^cwd:\s*(.+)$/m.exec(text);
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

function fileMayOverlapScanWindow(filePath: string, scanWindow: SourceScanWindow | undefined): boolean {
  if (!scanWindow?.fromMs && !scanWindow?.toMs) return true;
  try {
    const mtime = fs.statSync(filePath).mtimeMs;
    if (scanWindow.fromMs !== undefined && mtime < scanWindow.fromMs) return false;
    if (scanWindow.toMs !== undefined && mtime > scanWindow.toMs) return false;
  } catch {
    return true;
  }
  return true;
}

function walk(root: string, maxDepth: number, onFile: (filePath: string) => void, depth = 0): void {
  if (depth > maxDepth) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) walk(fullPath, maxDepth, onFile, depth + 1);
    else if (entry.isFile()) onFile(fullPath);
  }
}

function isReadableRegularFile(filePath: string, maxBytes: number): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size <= maxBytes;
  } catch {
    return false;
  }
}

function normalizeCopilotModel(model: string | undefined): string | undefined {
  if (!model) return undefined;
  return normalizePricingModelId(model);
}

function providerFromModel(model: string | undefined): string | undefined {
  const normalized = normalizeCopilotModel(model);
  if (!normalized) return "github-copilot";
  if (normalized.includes("claude")) return "anthropic";
  if (normalized.includes("gemini")) return "google";
  if (isCopilotAliasModel(normalized)) return "github-copilot";
  if (normalized.includes("gpt")) return "openai";
  return "github-copilot";
}

function firstPositiveNumber(object: Record<string, unknown>, keys: string[]): number {
  return keys.map((key) => numberValue(object[key])).find((value) => value > 0) ?? 0;
}

function firstObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(Math.trunc(value), 0);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(Math.trunc(parsed), 0) : 0;
  }
  return 0;
}

function dateValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
  }
  return timestampMsFromScalar(value);
}

function fileModifiedDate(filePath: string): string | undefined {
  try {
    return new Date(fs.statSync(filePath).mtimeMs).toISOString();
  } catch {
    return undefined;
  }
}

function minDate(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function maxDate(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function durationMs(startedAt: string | undefined, endedAt: string | undefined): number | undefined {
  if (!startedAt || !endedAt) return undefined;
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : undefined;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function uniqueFiles(files: CopilotFile[]): CopilotFile[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = path.resolve(file.filePath);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
