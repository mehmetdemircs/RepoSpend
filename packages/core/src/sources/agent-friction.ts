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
  for (const record of records) {
    applyActionMetadata(analysis, record);
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

function applyActionMetadata(analysis: AgentFrictionAnalysis, record: unknown): void {
  if (!record || typeof record !== "object") return;
  const object = record as Record<string, unknown>;
  const payload = firstObject(object.payload) ?? object;
  const type = stringValue(object.type) ?? stringValue(payload.type);
  const role = stringValue(payload.role);
  if (payload.type === "user_message" || role === "user") analysis.userPromptCount += 1;
  if (payload.type === "agent_message" || role === "assistant") analysis.assistantMessageCount += 1;

  const text = JSON.stringify(record).toLowerCase();
  const isTool = type?.includes("tool") || type?.includes("function_call") || text.includes("\"tool_call\"") || text.includes("\"function_call\"");
  if (isTool) analysis.toolCallCount += 1;
  const isNonZeroCommand = text.includes("exit_code") && !text.includes("\"exit_code\":0") && !text.includes("\"exit_code\": 0");
  if (isNonZeroCommand) analysis.commandIssues.push(classifyCommandIssue(record, analysis.commandIssues));
  if (/\b(exec_command|shell|bash|zsh|command)\b/.test(text)) analysis.shellCommandCount += 1;
  if (/\b(read_file|view_image|cat |sed |rg |grep |open_file)\b/.test(text)) analysis.fileReadCount += 1;
  if (/\b(apply_patch|write_file|edit|patch|created|deleted)\b/.test(text)) analysis.fileEditCount += 1;
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
  if (issue.severity === "critical") return "Repeated or blocking command issue that may have stopped progress.";
  if (issue.severity === "warning") return "Non-zero command event classified as important for this session.";
  if (issue.classification === "exploratory_miss") return "Likely exploratory command that found no result.";
  if (issue.classification === "harmless_nonzero") return "Likely harmless non-zero exit during normal shell exploration.";
  return "Non-zero command event with limited local context.";
}

function classifyCommandIssue(record: unknown, previousIssues: CommandIssue[]): CommandIssue {
  const raw = JSON.stringify(record);
  const text = raw.toLowerCase();
  const command = extractCommandText(record) ?? compactCommandText(raw);
  const category = commandCategory(text);
  const commandKey = normalizeCommand(command);
  const repeated = previousIssues.filter((issue) => issue.command === commandKey).length + 1 >= 3;

  if (isHarmlessNonZero(text)) {
    return { command: commandKey, category, classification: isExploratoryMiss(text) ? "exploratory_miss" : "harmless_nonzero", severity: "ignored", impact: "low" };
  }
  if (isImportantFailure(text, category) || repeated) {
    return { command: commandKey, category, classification: "blocking_failure", severity: repeated ? "critical" : importantSeverity(text, category), impact: repeated ? "high" : importantImpact(category) };
  }
  if (category === "search" || category === "filesystem") {
    return { command: commandKey, category, classification: "exploratory_miss", severity: "ignored", impact: "low" };
  }
  return { command: commandKey, category, classification: "unknown", severity: "info", impact: "low" };
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
