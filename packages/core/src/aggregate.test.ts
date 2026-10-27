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

  it("counts every distinct model slice, falls back to session model, and ignores unknown-only models", () => {
    const mixed = usage({
      id: "mixed",
      model: "gpt-6-astra",
      modelUsage: [
        { model: "gpt-6-astra", requestCount: 1, inputTokens: 150, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 15, reasoningTokens: 0, totalTokens: 165, estimatedCostUsd: 1.5 },
        { model: "gpt-6-sol", requestCount: 1, inputTokens: 50, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 5, reasoningTokens: 0, totalTokens: 55, estimatedCostUsd: 0.3 },
      ],
    });
    expect(summarize([mixed]).modelCount).toBe(2);

    // A filtered selection narrows the authoritative slices, so only the selected model counts.
    const filtered = { ...mixed, model: "gpt-6-sol", modelUsage: [mixed.modelUsage![1]!] };
    expect(summarize([filtered]).modelCount).toBe(1);

    // Unknown-only slices keep the legacy "no known model" semantics — no stale representative count.
    const unknownOnly = usage({ id: "u", model: undefined, modelUsage: [{ model: undefined, requestCount: 1, inputTokens: 10, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 1, reasoningTokens: 0, totalTokens: 11, estimatedCostUsd: undefined }] });
    expect(summarize([unknownOnly]).modelCount).toBe(0);

    // Legacy sessions without modelUsage count session.model, or nothing when absent.
    expect(summarize([usage({ id: "legacy", model: "gpt-6-astra" })]).modelCount).toBe(1);
    expect(summarize([usage({ id: "nomodel", model: undefined })]).modelCount).toBe(0);
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

  it("splits a mixed-model session into per-model slices without duplicating the session", () => {
    const groups = groupByModel([
      usage({
        id: "mixed",
        model: "gpt-6-astra",
        inputTokens: 200,
        outputTokens: 20,
        totalTokens: 220,
        estimatedCostUsd: 1.8,
        modelUsage: [
          { model: "gpt-6-astra", requestCount: 1, inputTokens: 150, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 15, reasoningTokens: 0, totalTokens: 165, estimatedCostUsd: 1.5 },
          { model: "gpt-6-sol", requestCount: 1, inputTokens: 50, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 5, reasoningTokens: 0, totalTokens: 55, estimatedCostUsd: 0.3 },
        ],
      }),
      usage({ id: "solo", model: "gpt-6-sol", inputTokens: 10, outputTokens: 1, totalTokens: 11, estimatedCostUsd: 0.05 }),
    ]);

    const astra = groups.find((g) => g.id === "gpt-6-astra");
    const sol = groups.find((g) => g.id === "gpt-6-sol");
    expect(astra?.sessionCount).toBe(1);
    expect(astra?.inputTokens).toBe(150);
    expect(astra?.estimatedCostUsd).toBe(1.5);
    expect(sol?.sessionCount).toBe(2);
    expect(sol?.inputTokens).toBe(60);
    expect(sol?.estimatedCostUsd).toBe(0.35);
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
