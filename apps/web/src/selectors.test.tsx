import { describe, expect, it } from "vitest";
import type { Session } from "./app-types";
import { compactModelLabel, objectsToCsv, sessionDisplayTitle, sessionMatchesSearch } from "./selectors";

describe("web selectors", () => {
  it("escapes downloaded CSV cells", () => {
    expect(objectsToCsv([{ repo: "Repo, Spend", warning: "quote \"here\"", tokens: 42 }])).toBe([
      "repo,warning,tokens",
      "\"Repo, Spend\",\"quote \"\"here\"\"\",42",
    ].join("\n"));
  });

  it("searches sessions by repo, model, app, title, and readable warnings", () => {
    const session = usage({
      title: "Fix local dashboard export filters",
      repoName: "RepoSpend",
      sourceApp: "VS Code",
      model: "gpt-5-codex",
      warnings: ["unknown_pricing"],
    });

    expect(sessionMatchesSearch(session, "dashboard export")).toBe(true);
    expect(sessionMatchesSearch(session, "RepoSpend")).toBe(true);
    expect(sessionMatchesSearch(session, "gpt-5-codex")).toBe(true);
    expect(sessionMatchesSearch(session, "cannot be priced")).toBe(true);
    expect(sessionMatchesSearch(session, "definitely absent")).toBe(false);
  });

  it("finds unpriced sessions even when the source warning is a missing token split", () => {
    const session = usage({
      estimatedCostUsd: undefined,
      warnings: ["missing_token_breakdown"],
    });

    expect(sessionMatchesSearch(session, "cannot be priced")).toBe(true);
  });

  it("keeps chart model labels canonical", () => {
    expect(compactModelLabel("claude-opus-4-7")).toBe("claude-opus-4-7");
    expect(compactModelLabel("very-long-custom-model-name-that-needs-truncation")).toBe("very-long-custom-model-na...");
  });

  it("strips markdown link scaffolding from session titles", () => {
    const session = usage({
      promptTimeline: [
        {
          role: "user",
          text: "Use [$ui-ux-pro-max](/Users/mmd/.codex/skills/ui-ux-pro-max/SKILL.md) on this screen",
        },
      ],
    });

    expect(sessionDisplayTitle(session)).toBe("Use $ui-ux-pro-max on this screen");
  });
});

function usage(overrides: Partial<Session> = {}): Session {
  return {
    id: "id",
    sourceClient: "codex",
    sourceApp: "Terminal",
    sourceAppRaw: "terminal",
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
    detectedSurface: "terminal_cli",
    ...overrides,
  };
}
