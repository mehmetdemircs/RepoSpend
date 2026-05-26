import { buildDashboardSnapshot, calculateCostUsd } from "@repospend/core";
import type { DashboardSnapshot, NormalizedUsage, UsageFilters } from "@repospend/types";
import { displaySessions, type DashboardReadOptions } from "../data.js";
import { baseDate, demoInputs, demoPricing, demoSources, demoSourceStats, type DemoSessionInput } from "./fixtures.js";

export { readDemoRtkGain } from "./rtk.js";

export function demoModeEnabled(): boolean {
  return process.env.REPOSPEND_DEMO_DATA === "lotr";
}

export function readDemoDashboardData(filters: UsageFilters = {}, options: DashboardReadOptions = {}): DashboardSnapshot {
  return buildDashboardSnapshot({
    sources: demoSources,
    sourceStats: demoSourceStats,
    sessions: displaySessions(demoSessions, options),
    filters,
  });
}

const demoSessions = demoInputs.map(toSession);

function toSession(input: DemoSessionInput): NormalizedUsage {
  const start = timestamp(input.hour, input.minute);
  const end = new Date(new Date(start).getTime() + input.durationMinutes * 60_000).toISOString();
  const repoRoot = `/demo/middle-earth/${input.repo}`;
  const totalTokens = input.inputTokens + input.outputTokens + input.reasoningTokens;
  const importantFailures = input.importantFailures ?? 0;
  const harmlessNonZero = input.harmlessNonZero ?? 0;
  const exploratoryMisses = input.exploratoryMisses ?? 0;
  const repeatedClusters = input.repeatedClusters ?? 0;
  const failedToolCalls = importantFailures + repeatedClusters;
  const nonZeroCommandEvents = importantFailures + harmlessNonZero + exploratoryMisses;
  const cost = calculateCostUsd({
    model: input.model,
    inputTokens: input.inputTokens,
    cachedInputTokens: input.cachedInputTokens,
    outputTokens: input.outputTokens,
    reasoningTokens: input.reasoningTokens,
  }, demoPricing);

  return {
    id: input.id,
    sourceClient: input.sourceClient,
    sourceApp: input.sourceApp,
    sourceAppRaw: input.sourceAppRaw ?? input.sourceApp.toLowerCase(),
    sourcePath: `/demo/middle-earth/${input.sourceClient}/sessions/${input.id}.jsonl`,
    repoRoot,
    repoName: input.repo,
    cwd: `${repoRoot}/worktree`,
    gitRemoteUrl: `https://example.invalid/middle-earth/${input.repo}.git`,
    gitBranch: input.branch,
    title: input.title,
    startedAt: start,
    endedAt: end,
    model: input.model,
    provider: input.provider,
    durationMs: input.durationMinutes * 60_000,
    rawEventCount: input.tools + input.replies + input.prompts + 8,
    parseStatus: "ok",
    parseErrors: [],
    detectedSurface: input.detectedSurface ?? detectedSurfaceForApp(input.sourceApp),
    surfaceConfidence: "high",
    surfaceReason: "Demo fixture includes an explicit fictional source app.",
    promptTimeline: [
      { role: "user", text: input.title, timestamp: start },
      { role: "assistant", text: demoReply(input.repo, input.edits, importantFailures), timestamp: timestamp(input.hour, Math.min(input.minute + 7, 59)) },
    ],
    sessionOutcome: input.outcome,
    inputTokens: input.inputTokens,
    cachedInputTokens: input.cachedInputTokens,
    outputTokens: input.outputTokens,
    reasoningTokens: input.reasoningTokens,
    reasoningOutputTokens: input.reasoningTokens,
    totalTokens,
    tokenAggregationMethod: "direct_usage",
    tokenConfidence: input.tokenConfidence ?? "high",
    tokenSnapshotCount: Math.max(2, Math.round(input.durationMinutes / 18)),
    estimatedCostUsd: cost,
    messageCount: input.prompts + input.replies,
    rawTokenTotal: totalTokens,
    warnings: input.warnings ?? [],
    userPromptCount: input.prompts,
    assistantMessageCount: input.replies,
    toolCallCount: input.tools,
    shellCommandCount: input.commands,
    failedToolCallCount: failedToolCalls,
    nonZeroCommandEvents,
    importantCommandFailures: importantFailures,
    harmlessNonZeroEvents: harmlessNonZero,
    exploratoryMisses,
    repeatedFailureClusters: repeatedClusters,
    commandIssueSeverity: importantFailures > 1 ? "critical" : importantFailures > 0 ? "warning" : "none",
    commandIssueImpact: importantFailures > 1 ? "high" : importantFailures > 0 ? "medium" : "none",
    topFailureType: input.topFailureType,
    commandIssueSamples: input.issueSamples ?? [],
    fileReadCount: input.reads,
    fileEditCount: input.edits,
  };
}

function detectedSurfaceForApp(sourceApp: string): NormalizedUsage["detectedSurface"] {
  if (sourceApp === "VS Code") return "vscode_extension";
  if (sourceApp === "Terminal") return "terminal_cli";
  if (sourceApp === "Codex app") return "codex_app_cloud";
  if (sourceApp === "Claude Desktop App") return "local_agent";
  return "terminal_cli";
}

function timestamp(hour: number, minute: number): string {
  return `${baseDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

function demoReply(repo: string, edits: number, importantFailures: number): string {
  if (importantFailures > 0) {
    return `Found the noisy path in ${repo}, separated the risky failures from ordinary exploration, and left a short list of follow-up checks.`;
  }
  if (edits === 0) {
    return `Mapped the spend pattern in ${repo} without changing files, which is exactly the kind of research-only trail RepoSpend should make visible.`;
  }
  return `Updated ${repo} with focused changes and enough local checks to make the token spend easy to explain.`;
}
