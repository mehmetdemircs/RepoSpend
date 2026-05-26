import { describe, expect, it } from "vitest";
import type { NormalizedUsage, Summary } from "@repospend/types";
import { buildRepoRollups } from "./repo-rollup.js";
import { summarize } from "./aggregate.js";
import { buildUsageHealth } from "./usage-health.js";

describe("buildUsageHealth", () => {
  it("returns empty signals for an empty corpus", () => {
    const summary = summarize([]);
    const health = buildUsageHealth({
      sessions: [],
      summary,
      repos: [],
      sourceApps: [],
      scan: { repoCount: 0, sessionCount: 0, sourceAppCount: 0, zeroTokenSessionCount: 0 },
    });
    expect(health.criticalCount).toBe(0);
    expect(health.wasteSignals).toEqual([]);
    expect(health.keyInsights).toEqual([]);
  });

  it("flags low cache reuse as an attention insight", () => {
    const sessions = [
      usage({ id: "a", inputTokens: 1000, cachedInputTokens: 50, totalTokens: 1100 }),
    ];
    const summary: Summary = summarize(sessions);
    const repos = buildRepoRollups(sessions);
    const health = buildUsageHealth({ sessions, summary, repos, sourceApps: [], scan: { repoCount: 1, sessionCount: 1, sourceAppCount: 1, zeroTokenSessionCount: 0 } });
    const cacheInsight = health.keyInsights.find((insight) => insight.label === "Cache reuse");
    expect(cacheInsight?.tone).toBe("attention");
  });

  it("reports cache reuse as good when at least half of input is cached", () => {
    const sessions = [
      usage({ id: "a", inputTokens: 1000, cachedInputTokens: 800, totalTokens: 1100 }),
    ];
    const summary = summarize(sessions);
    const repos = buildRepoRollups(sessions);
    const health = buildUsageHealth({ sessions, summary, repos, sourceApps: [], scan: { repoCount: 1, sessionCount: 1, sourceAppCount: 1, zeroTokenSessionCount: 0 } });
    expect(health.keyInsights.find((insight) => insight.label === "Cache reuse")?.tone).toBe("good");
  });

  it("counts critical signals separately from attention signals", () => {
    const sessions = [
      usage({ id: "a", failedToolCallCount: 5, importantCommandFailures: 5, nonZeroCommandEvents: 5, shellCommandCount: 6, totalTokens: 2_000_000, fileEditCount: 0 }),
    ];
    const summary = summarize(sessions);
    const repos = buildRepoRollups(sessions);
    const health = buildUsageHealth({ sessions, summary, repos, sourceApps: [], scan: { repoCount: 1, sessionCount: 1, sourceAppCount: 1, zeroTokenSessionCount: 0 } });
    expect(health.signals.length).toBeGreaterThan(0);
    expect(health.affectedSessionCount).toBeGreaterThan(0);
  });
});

function usage(overrides: Partial<NormalizedUsage> = {}): NormalizedUsage {
  return {
    id: "id",
    sourceClient: "codex",
    sourceApp: "VS Code",
    sourceAppRaw: "vscode",
    sourcePath: "/tmp/source",
    repoRoot: "/tmp/repo",
    repoName: "repo",
    cwd: "/tmp/repo",
    gitRemoteUrl: undefined,
    gitBranch: undefined,
    title: undefined,
    startedAt: "2026-05-18T10:00:00.000Z",
    endedAt: "2026-05-18T11:00:00.000Z",
    model: "gpt-5",
    provider: "openai",
    inputTokens: 100,
    cachedInputTokens: 10,
    outputTokens: 20,
    reasoningTokens: 5,
    reasoningOutputTokens: 5,
    totalTokens: 135,
    tokenAggregationMethod: "direct_usage",
    tokenConfidence: "medium",
    tokenSnapshotCount: 1,
    estimatedCostUsd: 0.01,
    messageCount: 2,
    rawTokenTotal: 135,
    warnings: [],
    userPromptCount: 0,
    assistantMessageCount: 0,
    toolCallCount: 0,
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
    fileEditCount: 1,
    detectedSurface: "vscode_extension",
    ...overrides,
  };
}
