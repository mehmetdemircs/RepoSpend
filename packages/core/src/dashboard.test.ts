import { describe, expect, it } from "vitest";
import { buildDashboardSnapshot, buildRepoRollups, buildUsageHealth } from "./index.js";
import type { NormalizedUsage } from "@repospend/types";

describe("dashboard snapshot", () => {
  it("owns filtered sessions, skipped zero-token sessions, repo rollups, and health", () => {
    const sessions = [
      usage({ id: "a", repoRoot: "/repo/a", repoName: "A", totalTokens: 1_000_000, fileEditCount: 2, estimatedCostUsd: 2, startedAt: "2026-05-18T10:00:00.000Z" }),
      usage({ id: "b", repoRoot: "/repo/a", repoName: "A", totalTokens: 500_000, fileEditCount: 0, failedToolCallCount: 2, importantCommandFailures: 2, nonZeroCommandEvents: 2, shellCommandCount: 4, estimatedCostUsd: 1, startedAt: "2026-05-18T11:00:00.000Z" }),
      usage({ id: "c", repoRoot: "/repo/b", repoName: "B", totalTokens: 0, fileEditCount: 0, estimatedCostUsd: undefined, startedAt: "2026-05-18T12:00:00.000Z" }),
    ];

    const dashboard = buildDashboardSnapshot({
      sources: [{ id: "codex", label: "Codex", available: true, paths: [], warnings: [] }],
      sourceStats: [{ sessionFileCount: 3, lastScannedAt: "2026-05-18T13:00:00.000Z" }],
      sessions,
      filters: { from: "2026-05-18", to: "2026-05-18" },
    });

    expect(dashboard.sessions.map((session) => session.id)).toEqual(["a", "b"]);
    expect(dashboard.skippedZeroTokenSessions).toBe(1);
    expect(dashboard.repos).toHaveLength(1);
    expect(dashboard.repos[0]?.fileEditCount).toBe(2);
    expect(dashboard.repos[0]?.failedCommandCount).toBe(2);
    expect(dashboard.health.wasteSignals.some((signal) => signal.id === "command-issue-sessions")).toBe(true);
    expect(dashboard.confidence.unpricedTokenSessions).toBe(0);
    expect(dashboard.confidence.tokenDataSessions).toBe(2);
  });

  it("excludes unknown-start sessions when date filters are active", () => {
    const dashboard = buildDashboardSnapshot({
      sources: [],
      sourceStats: [],
      sessions: [usage({ id: "unknown-date", startedAt: undefined, totalTokens: 100 })],
      filters: { from: "2026-05-18" },
    });

    expect(dashboard.sessions).toEqual([]);
  });

  it("supports multi-select source, repo, app, and model filters", () => {
    const dashboard = buildDashboardSnapshot({
      sources: [],
      sourceStats: [],
      sessions: [
        usage({ id: "a", repoName: "A", repoRoot: "/repo/a", sourceApp: "VS Code", model: "gpt-5" }),
        usage({ id: "b", repoName: "B", repoRoot: "/repo/b", sourceApp: "Terminal", model: "gpt-5" }),
        usage({ id: "c", repoName: "C", repoRoot: "/repo/c", sourceApp: "Codex app", model: "gpt-4" }),
      ],
      filters: { repo: ["A", "B"], sourceApp: ["VS Code", "Terminal"], model: ["gpt-5"] },
    });

    expect(dashboard.sessions.map((session) => session.id)).toEqual(["a", "b"]);
  });

  it("supports filtering sessions whose model was not recorded", () => {
    const dashboard = buildDashboardSnapshot({
      sources: [],
      sourceStats: [],
      sessions: [
        usage({ id: "missing", repoName: "A", repoRoot: "/repo/a", sourceApp: "VS Code", model: undefined, totalTokens: 100 }),
        usage({ id: "known", repoName: "B", repoRoot: "/repo/b", sourceApp: "Terminal", model: "gpt-5", totalTokens: 100 }),
      ],
      filters: { model: ["unknown-model"] },
    });

    expect(dashboard.sessions.map((session) => session.id)).toEqual(["missing"]);
    expect(dashboard.models).toEqual([
      expect.objectContaining({ id: "unknown-model", label: "Model not recorded", sessionCount: 1 }),
    ]);
  });
});

describe("repo rollup and usage health", () => {
  it("keeps repo product facts local to the rollup", () => {
    const rollups = buildRepoRollups([
      usage({ id: "a", repoRoot: "/repo/shared", repoName: "Display", totalTokens: 1000, fileEditCount: 2 }),
      usage({ id: "b", repoRoot: "/repo/shared", repoName: "Display", totalTokens: 500, fileEditCount: 0, failedToolCallCount: 1, importantCommandFailures: 1 }),
    ]);

    expect(rollups).toHaveLength(1);
    expect(rollups[0]?.sessions).toHaveLength(2);
    expect(rollups[0]?.fileEditCount).toBe(2);
    expect(rollups[0]?.failedCommandCount).toBe(1);
    expect(rollups[0]?.tokenRoiTokensPerEdit).toBe(750);
  });

  it("classifies health signals without UI prose parsing", () => {
    const sessions = [
      usage({ id: "failed", failedToolCallCount: 3, importantCommandFailures: 3, nonZeroCommandEvents: 3, shellCommandCount: 5, totalTokens: 2_000_000, fileEditCount: 0 }),
    ];
    const summary = buildDashboardSnapshot({ sources: [], sourceStats: [], sessions }).summary;
    const repos = buildRepoRollups(sessions);
    const health = buildUsageHealth({ sessions, summary, repos, sourceApps: [], scan: { repoCount: 1, sessionCount: 1, sourceAppCount: 1, zeroTokenSessionCount: 0 } });

    expect(health.signals.some((signal) => signal.id === "command-friction")).toBe(true);
    expect(health.wasteSignals.some((signal) => signal.id === "high-token-no-edit")).toBe(true);
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
