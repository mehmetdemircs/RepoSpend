import { describe, expect, it } from "vitest";
import type { NormalizedUsage } from "@repospend/types";
import { buildDataConfidence } from "./data-confidence.js";

describe("data confidence", () => {
  it("reports high confidence when token, pricing, repo, and parse coverage are healthy", () => {
    const report = buildDataConfidence({
      sources: [{ id: "codex", label: "Codex", available: true, paths: [], warnings: [] }],
      sourceStats: [{ sourceId: "codex", sourceLabel: "Codex", sessionFileCount: 1, sessionsImported: 1, lastScannedAt: "2026-05-18T10:00:00.000Z" }],
      sessions: [usage({ tokenConfidence: "high" })],
      scan: { rawSessionCount: 1, parseFailureCount: 0 },
    });

    expect(report.label).toBe("High");
    expect(report.score).toBe(100);
    expect(report.issues).toEqual([]);
  });

  it("surfaces unpriced, missing-token, parser, repo, and source warning issues", () => {
    const report = buildDataConfidence({
      sources: [{ id: "claude", label: "Claude Code", available: true, paths: [], warnings: ["projects directory not found"] }],
      sourceStats: [{ sourceId: "claude", sourceLabel: "Claude Code", sessionFileCount: 2, sessionsImported: 2, parseFailureCount: 1, lastScannedAt: "2026-05-18T10:00:00.000Z" }],
      sessions: [
        usage({ id: "unpriced", estimatedCostUsd: undefined, tokenConfidence: "medium" }),
        usage({ id: "missing", totalTokens: 0, warnings: ["missing_token_breakdown", "repo_unverified_no_git_root"], detectedSurface: "unknown" }),
      ],
      scan: { rawSessionCount: 2, parseFailureCount: 1 },
    });

    expect(report.label).toBe("Low");
    expect(report.unpricedTokenSessions).toBe(1);
    expect(report.missingTokenSessions).toBe(1);
    expect(report.unknownRepoSessions).toBe(1);
    expect(report.unknownSurfaceSessions).toBe(1);
    expect(report.issues.map((issue) => issue.id)).toEqual([
      "missing-token-data",
      "unpriced-token-sessions",
      "parse-issues",
      "unknown-repo-grouping",
      "unknown-surfaces",
      "source-warnings",
    ]);
  });

  it("does not treat a verified repo with unknown in its name as unverified", () => {
    const report = buildDataConfidence({
      sources: [{ id: "codex", label: "Codex", available: true, paths: [], warnings: [] }],
      sourceStats: [{ sourceId: "codex", sourceLabel: "Codex", sessionFileCount: 1, sessionsImported: 1, lastScannedAt: "2026-05-18T10:00:00.000Z" }],
      sessions: [usage({ repoName: "unknown-pleasures", repoRoot: "/tmp/unknown-pleasures" })],
      scan: { rawSessionCount: 1, parseFailureCount: 0 },
    });

    expect(report.unknownRepoSessions).toBe(0);
    expect(report.verifiedRepoSessions).toBe(1);
    expect(report.issues.map((issue) => issue.id)).not.toContain("unknown-repo-grouping");
  });

  it("reports low confidence when no local sources are available", () => {
    const report = buildDataConfidence({
      sources: [{ id: "codex", label: "Codex", available: false, paths: [], warnings: [] }],
      sourceStats: [],
      sessions: [],
      scan: { rawSessionCount: 0, parseFailureCount: 0 },
    });

    expect(report.label).toBe("Low");
    expect(report.score).toBe(0);
    expect(report.issues.map((issue) => issue.id)).toEqual(["no-local-sources"]);
  });

  it("reports low confidence when sources exist but no sessions were imported", () => {
    const report = buildDataConfidence({
      sources: [{ id: "codex", label: "Codex", available: true, paths: [], warnings: [] }],
      sourceStats: [{ sourceId: "codex", sourceLabel: "Codex", sessionFileCount: 0, sessionsImported: 0, lastScannedAt: "2026-05-18T10:00:00.000Z" }],
      sessions: [],
      scan: { rawSessionCount: 0, parseFailureCount: 0 },
    });

    expect(report.label).toBe("Low");
    expect(report.score).toBe(50);
    expect(report.issues.map((issue) => issue.id)).toEqual(["no-sessions-imported"]);
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
    tokenConfidence: "high",
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
