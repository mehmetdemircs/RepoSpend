import { describe, expect, it } from "vitest";
import type { NormalizedUsage } from "@repospend/types";
import { groupByDay, groupByModel, groupByRepo, groupBySourceApp, summarize, toCsv } from "./aggregate.js";

describe("summarize", () => {
  it("computes totals, cached input share, and repo counts", () => {
    const sessions = [
      usage({ id: "a", inputTokens: 100, cachedInputTokens: 25, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 2 }),
      usage({ id: "b", inputTokens: 200, cachedInputTokens: 50, outputTokens: 100, totalTokens: 300, estimatedCostUsd: 4 }),
      usage({ id: "c", repoRoot: "/repo/other", repoName: "other", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: undefined }),
    ];

    const summary = summarize(sessions);

    expect(summary.sessionCount).toBe(3);
    expect(summary.repoCount).toBe(2);
    expect(summary.estimatedCostUsd).toBe(6);
    expect(summary.knownCostSessions).toBe(2);
    expect(summary.unknownCostSessions).toBe(1);
    expect(summary.inputTokens).toBe(300);
    expect(summary.cachedInputTokens).toBe(75);
    expect(summary.cachedInputPct).toBeCloseTo(0.25, 5);
    expect(summary.totalTokens).toBe(450);
  });

  it("returns undefined cost when no session has a known cost", () => {
    const summary = summarize([usage({ estimatedCostUsd: undefined })]);
    expect(summary.estimatedCostUsd).toBeUndefined();
    expect(summary.knownCostSessions).toBe(0);
  });
});

describe("group helpers", () => {
  it("groups by repo with the correct labels", () => {
    const groups = groupByRepo([
      usage({ id: "a", repoRoot: "/r/a", repoName: "A", estimatedCostUsd: 1, totalTokens: 100 }),
      usage({ id: "b", repoRoot: "/r/a", repoName: "A", estimatedCostUsd: 2, totalTokens: 200 }),
      usage({ id: "c", repoRoot: "/r/b", repoName: "B", estimatedCostUsd: 5, totalTokens: 50 }),
    ]);
    expect(groups.map((g) => g.id)).toEqual(["/r/b", "/r/a"]);
    expect(groups.find((g) => g.id === "/r/a")?.sessionCount).toBe(2);
  });

  it("relabels unknown-model bucket only when every unknown is a Claude synthetic-zero session", () => {
    const onlySynthetic = groupByModel([
      usage({ id: "a", model: undefined, warnings: ["claude_synthetic_zero_usage"] }),
    ]);
    expect(onlySynthetic.find((g) => g.id === "unknown-model")?.label).toBe("Claude synthetic / no usage");

    const mixed = groupByModel([
      usage({ id: "a", model: undefined, warnings: ["claude_synthetic_zero_usage"] }),
      usage({ id: "b", model: undefined, warnings: [] }),
    ]);
    expect(mixed.find((g) => g.id === "unknown-model")?.label).toBe("Model not recorded");
  });

  it("groups by source app and by day", () => {
    const sessions = [
      usage({ id: "a", sourceApp: "VS Code", startedAt: "2026-05-18T10:00:00.000Z" }),
      usage({ id: "b", sourceApp: "VS Code", startedAt: "2026-05-19T10:00:00.000Z" }),
      usage({ id: "c", sourceApp: "Terminal", startedAt: "2026-05-19T11:00:00.000Z" }),
    ];
    expect(groupBySourceApp(sessions).map((g) => g.id).sort()).toEqual(["Terminal", "VS Code"]);
    expect(groupByDay(sessions).map((g) => g.id).sort()).toEqual(["2026-05-18", "2026-05-19"]);
  });
});

describe("toCsv", () => {
  it("emits a header row and one row per session", () => {
    const csv = toCsv([usage({ id: "a" }), usage({ id: "b" })]);
    const lines = csv.trim().split("\n");
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain("id");
    expect(lines[1]).toContain("a");
    expect(lines[2]).toContain("b");
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
