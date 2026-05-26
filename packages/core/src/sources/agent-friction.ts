import type { CommandCategory, CommandIssueClassification, CommandIssueImpact, CommandIssueSample, CommandIssueSeverity } from "@repospend/types";

export interface CommandIssue {
  command: string;
  category: CommandCategory;
  classification: CommandIssueClassification;
  severity: CommandIssueSeverity;
  impact: CommandIssueImpact;
}

export interface AgentFrictionAnalysis {
  commandIssues: CommandIssue[];
  shellCommandCount: number;
  failedToolCallCount: number;
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
  toolCallCount: number;
  userPromptCount: number;
  assistantMessageCount: number;
}

export function analyzeAgentFriction(records: unknown[], totalTokens: number): AgentFrictionAnalysis {
  const analysis = emptyAgentFrictionAnalysis();
  const messages: AgentMessage[] = [];
  const toolCallsById = indexToolCallsById(records);
  for (const record of records) {
    applyActionMetadata(analysis, record, messages, toolCallsById);
  }
  finalizeCommandIssues(analysis, totalTokens);
  return analysis;
}

function emptyAgentFrictionAnalysis(): AgentFrictionAnalysis {
  return {
    commandIssues: [],
    shellCommandCount: 0,
    failedToolCallCount: 0,
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
    toolCallCount: 0,
    userPromptCount: 0,
    assistantMessageCount: 0,
  };
}

type AgentMessage = { role: "user" | "assistant"; text: string; timestamp?: string | undefined };

function applyActionMetadata(analysis: AgentFrictionAnalysis, record: unknown, messages: AgentMessage[], toolCallsById: Map<string, string>): void {
  if (!record || typeof record !== "object") return;
  const object = record as Record<string, unknown>;
  const payload = firstObject(object.payload) ?? object;
  const type = stringValue(object.type) ?? stringValue(payload.type);
  const role = stringValue(payload.role);
  const messageRole: AgentMessage["role"] | undefined = payload.type === "user_message" || role === "user" ? "user" : payload.type === "agent_message" || role === "assistant" ? "assistant" : undefined;
  if (messageRole) applyMessageCount(analysis, messages, messageRole, payload, object);

  const text = JSON.stringify(record).toLowerCase();
  const isTool = type?.includes("tool") || type?.includes("function_call") || text.includes("\"tool_call\"") || text.includes("\"function_call\"");
  if (isTool) analysis.toolCallCount += 1;
  const isNonZeroCommand = hasNonZeroCommandExit(record);
  if (isNonZeroCommand) analysis.commandIssues.push(classifyCommandIssue(record, analysis.commandIssues, commandTextForToolOutput(record, toolCallsById)));
  if (/\b(exec_command|shell|bash|zsh|command)\b/.test(text)) analysis.shellCommandCount += 1;
  if (/\b(read_file|view_image|cat |sed |rg |grep |open_file)\b/.test(text)) analysis.fileReadCount += 1;
  if (/\b(apply_patch|write_file|edit|patch|created|deleted)\b/.test(text)) analysis.fileEditCount += 1;
}

function indexToolCallsById(records: unknown[]): Map<string, string> {
  const calls = new Map<string, string>();
  const sessionCommands = new Map<string, string>();
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const object = record as Record<string, unknown>;
    const payload = firstObject(object.payload) ?? object;
    const type = `${stringValue(object.type) ?? ""} ${stringValue(payload.type) ?? ""}`.toLowerCase();
    const callId = stringValue(payload.call_id ?? object.call_id ?? payload.callId ?? object.callId);
    if (type.includes("function_call_output") || type.includes("custom_tool_call_output") || type.includes("tool_result")) {
      const output = stringValue(payload.output ?? object.output);
      const sessionId = output?.match(/\bProcess running with session ID\s+(\d+)\b/i)?.[1];
      const command = callId ? calls.get(callId) : undefined;
      if (sessionId && command) sessionCommands.set(sessionId, command);
      continue;
    }
    if (!type.includes("function_call") && !type.includes("custom_tool_call") && !type.includes("tool_call")) continue;
    const command = toolCallCommandText(payload, sessionCommands) ?? toolCallCommandText(object, sessionCommands);
    if (callId && command) calls.set(callId, command);
  }
  return calls;
}

function commandTextForToolOutput(record: unknown, toolCallsById: Map<string, string>): string | undefined {
  if (!record || typeof record !== "object") return undefined;
  const object = record as Record<string, unknown>;
  const payload = firstObject(object.payload) ?? object;
  const callId = stringValue(payload.call_id ?? object.call_id ?? payload.callId ?? object.callId);
  return callId ? toolCallsById.get(callId) : undefined;
}

function toolCallCommandText(object: Record<string, unknown>, sessionCommands: Map<string, string>): string | undefined {
  const name = `${stringValue(object.name) ?? ""} ${stringValue(object.recipient_name) ?? ""}`.toLowerCase();
  const args = object.arguments ?? object.args ?? object.input;
  const parsedArgs = typeof args === "string" ? parseJsonObject(args) : firstObject(args);
  const sessionId = parsedArgs ? idValue(parsedArgs.session_id) : undefined;
  if (sessionId && sessionCommands.has(sessionId)) return sessionCommands.get(sessionId);
  const command = parsedArgs ? extractCommandText(parsedArgs) : undefined;
  if (command) return command;
  if ((name.includes("exec_command") || name.includes("shell")) && typeof args === "string" && args.trim()) return args;
  const toolName = stringValue(object.name) ?? stringValue(object.recipient_name);
  if (!toolName) return undefined;
  return sessionId ? `${toolName} session ${sessionId}` : toolName;
}

function hasNonZeroCommandExit(record: unknown): boolean {
  if (!record || typeof record !== "object") return false;
  const object = record as Record<string, unknown>;
  const payload = firstObject(object.payload) ?? object;
  const type = `${stringValue(object.type) ?? ""} ${stringValue(payload.type) ?? ""}`.toLowerCase();
  const isCommandRecord = /(function_call_output|custom_tool_call_output|tool_result|exec_command|shell|command)/.test(type)
    || Boolean(extractCommandText(payload) ?? extractCommandText(object));
  const explicitExitCode = exitCodeValue(payload) ?? exitCodeValue(object);
  if (explicitExitCode !== undefined) return isCommandRecord && explicitExitCode !== 0;

  const output = stringValue(payload.output) ?? stringValue(object.output);
  if (!output || !/(function_call_output|custom_tool_call_output|tool_result|exec_command)/.test(type)) return false;
  const processExitCode = output.match(/\bProcess exited with code\s+(-?\d+)\b/i)?.[1];
  return processExitCode !== undefined && Number(processExitCode) !== 0;
}

function exitCodeValue(object: Record<string, unknown>): number | undefined {
  const value = object.exit_code ?? object.exitCode;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
  return undefined;
}

function finalizeCommandIssues(analysis: AgentFrictionAnalysis, totalTokens: number): void {
  const repeatedCommands = new Map<string, number>();
  const repeatableIssues = analysis.commandIssues.filter((issue) => issue.classification !== "harmless_nonzero" && issue.classification !== "exploratory_miss");
  for (const issue of repeatableIssues) {
    repeatedCommands.set(issue.command, (repeatedCommands.get(issue.command) ?? 0) + 1);
  }
  const repeatedFailures = [...repeatedCommands.entries()].filter(([, count]) => count >= 3);
  if (repeatedFailures.length > 0) {
    analysis.repeatedFailureClusters = repeatedFailures.length;
    for (const issue of analysis.commandIssues) {
      if (repeatedCommands.get(issue.command)! >= 3 && issue.classification !== "harmless_nonzero" && issue.classification !== "exploratory_miss") {
        issue.classification = "blocking_failure";
        issue.severity = "critical";
        issue.impact = "high";
      }
    }
  }

  if (totalTokens >= 1_000_000 && analysis.commandIssues.length >= 5) {
    for (const issue of analysis.commandIssues) {
      if (issue.severity === "warning") issue.impact = "high";
    }
  }

  analysis.nonZeroCommandEvents = analysis.commandIssues.length;
  analysis.importantCommandFailures = analysis.commandIssues.filter((issue) => issue.severity === "critical" || issue.severity === "warning").length;
  analysis.harmlessNonZeroEvents = analysis.commandIssues.filter((issue) => issue.classification === "harmless_nonzero").length;
  analysis.exploratoryMisses = analysis.commandIssues.filter((issue) => issue.classification === "exploratory_miss").length;
  analysis.failedToolCallCount = analysis.importantCommandFailures;
  analysis.commandIssueSeverity = strongestSeverity(analysis.commandIssues);
  analysis.commandIssueImpact = strongestImpact(analysis.commandIssues);
  analysis.topFailureType = topFailureType(analysis.commandIssues);
  analysis.commandIssueSamples = sampledCommandIssues(analysis.commandIssues);
}

function sampledCommandIssues(issues: CommandIssue[]): CommandIssueSample[] {
  return [...issues]
    .sort((a, b) => issuePriority(b) - issuePriority(a))
    .slice(0, 12)
    .map((issue) => ({
      ...issue,
      reason: commandIssueReason(issue),
    }));
}

function issuePriority(issue: CommandIssue): number {
  const severityScore = issue.severity === "critical" ? 4 : issue.severity === "warning" ? 3 : issue.severity === "info" ? 2 : issue.severity === "ignored" ? 1 : 0;
  const impactScore = issue.impact === "high" ? 3 : issue.impact === "medium" ? 2 : issue.impact === "low" ? 1 : 0;
  return severityScore * 10 + impactScore;
}

function commandIssueReason(issue: CommandIssue): string {
  if (issue.severity === "critical") return "Repeated or blocking command failure that may have stopped progress.";
  if (issue.severity === "warning") return "Non-zero command event classified as worth reviewing for this session.";
  if (issue.classification === "exploratory_miss") return "Likely exploratory command that found no result.";
  if (issue.classification === "harmless_nonzero") return "Likely harmless non-zero exit during normal shell exploration.";
  return "Non-zero command event with limited local context.";
}

function classifyCommandIssue(record: unknown, previousIssues: CommandIssue[], commandHint?: string | undefined): CommandIssue {
  const raw = JSON.stringify(record);
  const text = raw.toLowerCase();
  const command = commandHint ?? extractCommandText(record) ?? compactCommandText(raw);
  const commandText = command.toLowerCase();
  const classificationText = commandHint ? `${commandText} ${commandOutputText(record) ?? ""}` : text;
  const category = commandCategory(commandHint ? commandText : text);
  const commandKey = normalizeCommand(command);
  const repeated = previousIssues.filter((issue) => issue.command === commandKey).length + 1 >= 3;

  if (isHarmlessNonZero(classificationText)) {
    return { command: commandKey, category, classification: isExploratoryMiss(classificationText) ? "exploratory_miss" : "harmless_nonzero", severity: "ignored", impact: "low" };
  }
  if (isImportantFailure(classificationText, category) || repeated) {
    return { command: commandKey, category, classification: "blocking_failure", severity: repeated ? "critical" : importantSeverity(classificationText, category), impact: repeated ? "high" : importantImpact(category) };
  }
  if (category === "search" || category === "filesystem") {
    return { command: commandKey, category, classification: "exploratory_miss", severity: "ignored", impact: "low" };
  }
  return { command: commandKey, category, classification: "unknown", severity: "info", impact: "low" };
}

function commandOutputText(record: unknown): string | undefined {
  if (!record || typeof record !== "object") return undefined;
  const object = record as Record<string, unknown>;
  const payload = firstObject(object.payload) ?? object;
  return stringValue(payload.output ?? object.output)?.toLowerCase().slice(0, 2000);
}

function isHarmlessNonZero(text: string): boolean {
  return /\b(rg|grep)\b/.test(text)
    || /git\s+(diff|status)/.test(text)
    || /\bfind\b/.test(text)
    || /\btest\s+(-f|-d|-e)\b/.test(text)
    || /\b(ls|cat)\b/.test(text) && /(optional|exists|existence|not found|no such file)/.test(text);
}

function isExploratoryMiss(text: string): boolean {
  return /\b(rg|grep|find)\b/.test(text) || /(no matches|not found|no such file|existence)/.test(text);
}

function isImportantFailure(text: string, category: CommandCategory): boolean {
  return category === "install"
    || category === "build"
    || category === "test"
    || category === "lint"
    || category === "typecheck"
    || category === "deploy"
    || category === "database"
    || category === "auth_env"
    || /(command not found|permission denied|authentication|unauthorized|missing environment|missing env|database connection|connection refused|deployment failed|tsc\b|vite build|next build)/.test(text);
}

function commandCategory(text: string): CommandCategory {
  if (/\b(pnpm|npm|yarn|bun)\s+(install|add|i)\b/.test(text)) return "install";
  if (/\b(pnpm|npm|yarn|bun)\s+[^"']*build\b|\b(vite|next)\s+build\b/.test(text)) return "build";
  if (/\b(pnpm|npm|yarn|bun)\s+[^"']*test\b|\b(vitest|jest|playwright)\b/.test(text)) return "test";
  if (/\b(pnpm|npm|yarn|bun)\s+[^"']*lint\b|\beslint\b/.test(text)) return "lint";
  if (/\b(pnpm|npm|yarn|bun)\s+[^"']*typecheck\b|\btsc\b/.test(text)) return "typecheck";
  if (/\b(vercel|deploy|netlify|railway|flyctl)\b/.test(text)) return "deploy";
  if (/\bgit\b/.test(text)) return "git";
  if (/\b(rg|grep|find)\b/.test(text)) return "search";
  if (/\b(ls|cat|sed|test|stat|mkdir|rm|cp|mv)\b/.test(text)) return "filesystem";
  if (/\b(pnpm|npm|yarn|bun|npx)\b/.test(text)) return "package_manager";
  if (/\b(dev|serve|localhost|vite --host|next dev)\b/.test(text)) return "dev_server";
  if (/\b(sqlite|postgres|mysql|database|db:|prisma|drizzle)\b/.test(text)) return "database";
  if (/\b(auth|token|api key|environment variable|env var|permission denied|unauthorized)\b/.test(text)) return "auth_env";
  return "unknown";
}

function importantSeverity(text: string, category: CommandCategory): CommandIssueSeverity {
  if (category === "deploy" || category === "database" || category === "auth_env" || /(command not found|permission denied|authentication|unauthorized)/.test(text)) return "critical";
  return "warning";
}

function importantImpact(category: CommandCategory): CommandIssueImpact {
  return category === "install" || category === "build" || category === "test" || category === "typecheck" || category === "deploy" ? "high" : "medium";
}

function strongestSeverity(issues: CommandIssue[]): CommandIssueSeverity {
  if (issues.some((issue) => issue.severity === "critical")) return "critical";
  if (issues.some((issue) => issue.severity === "warning")) return "warning";
  if (issues.some((issue) => issue.severity === "info")) return "info";
  if (issues.some((issue) => issue.severity === "ignored")) return "ignored";
  return "none";
}

function strongestImpact(issues: CommandIssue[]): CommandIssueImpact {
  if (issues.some((issue) => issue.impact === "high")) return "high";
  if (issues.some((issue) => issue.impact === "medium")) return "medium";
  if (issues.some((issue) => issue.impact === "low")) return "low";
  return "none";
}

function topFailureType(issues: CommandIssue[]): CommandCategory | CommandIssueClassification | undefined {
  const important = issues.filter((issue) => issue.severity === "critical" || issue.severity === "warning");
  const source = important.length ? important : issues;
  const counts = new Map<string, number>();
  for (const issue of source) counts.set(issue.category === "unknown" ? issue.classification : issue.category, (counts.get(issue.category === "unknown" ? issue.classification : issue.category) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as CommandCategory | CommandIssueClassification | undefined;
}

function extractCommandText(record: unknown): string | undefined {
  if (!record || typeof record !== "object") return undefined;
  const seen = new Set<unknown>();
  const stack: unknown[] = [record];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const object = current as Record<string, unknown>;
    for (const key of ["command", "cmd", "argv", "args"]) {
      const value = object[key];
      if (typeof value === "string" && value.length) return value;
      if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value.join(" ");
    }
    stack.push(...Object.values(object));
  }
  return undefined;
}

function normalizeCommand(command: string): string {
  return command.replace(/\s+/g, " ").trim().slice(0, 160) || "unknown";
}

function compactCommandText(text: string): string {
  return normalizeCommand(text.toLowerCase().replace(/\\n/g, " ").slice(0, 160));
}

function firstObject(...values: unknown[]): Record<string, unknown> | undefined {
  return values.find((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value));
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    return firstObject(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function idValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function applyMessageCount(analysis: AgentFrictionAnalysis, messages: AgentMessage[], role: AgentMessage["role"], payload: Record<string, unknown>, object: Record<string, unknown>): void {
  const message = extractMessageText(payload) ?? extractMessageText(object);
  if (!message) return;
  const item = {
    role,
    text: compactText(message),
    timestamp: dateValue(payload.timestamp) ?? dateValue(object.timestamp) ?? dateValue(payload.created_at) ?? dateValue(object.created_at),
  };
  if (!item.text || isCodexStartupContext(item.text) || hasNearbyDuplicateMessage(messages, item)) return;
  messages.push(item);
  if (role === "user") analysis.userPromptCount += 1;
  if (role === "assistant") analysis.assistantMessageCount += 1;
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

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isCodexStartupContext(text: string): boolean {
  return text.includes("<environment_context>") && (text.includes("# AGENTS.md instructions") || text.includes("<INSTRUCTIONS>"));
}

function hasNearbyDuplicateMessage(items: AgentMessage[], item: AgentMessage): boolean {
  return items.some((existing) => {
    if (existing.role !== item.role || existing.text !== item.text) return false;
    if (!existing.timestamp || !item.timestamp) return true;
    const existingTime = new Date(existing.timestamp).getTime();
    const itemTime = new Date(item.timestamp).getTime();
    if (!Number.isFinite(existingTime) || !Number.isFinite(itemTime)) return false;
    return Math.abs(existingTime - itemTime) <= 5_000;
  });
}

function dateValue(value: unknown): string | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return new Date(value > 10_000_000_000 ? value : value * 1000).toISOString();
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return undefined;
}
