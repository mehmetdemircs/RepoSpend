import { describe, expect, it } from "vitest";
import type { Session } from "./app-types";
import { compactModelLabel, objectsToCsv, pricingEditModel, pricingGapReason, pricingRows, pricingRowNote, readableWarning, sessionDisplayTitle, sessionMatchesSearch, unpricedModelsFromWarnings, usedPricingModels } from "./selectors";

describe("web selectors", () => {
  it("edits inherited Haiku snapshots through their base card and keeps explicit overrides", () => {
    const snapshot = "claude-haiku-5-5-20261007";
    const base = { inputPerMillion: 0.1, outputPerMillion: 0.5 };
    const draft = { "claude-haiku-5-5": base, "claude-haiku-5-5-long-context": { inputPerMillion: 0.5, outputPerMillion: 2.5 } };
    expect(pricingEditModel(snapshot, draft)).toBe("claude-haiku-5-5");
    expect(pricingEditModel(snapshot, { ...draft, [snapshot]: base })).toBe(snapshot);
    const custom = { ...draft, [snapshot]: base };
    expect(pricingRowNote(pricingRows(custom, []).find((row) => row.model === snapshot)!, custom)).toBe("Explicit custom card · flat rates");
    const alias = { "gpt-5-mini": { inputPerMillion: 1, outputPerMillion: 2 } };
    expect(pricingRowNote(pricingRows(alias, [], ["copilot/gpt-5-mini"])[0]!, alias)).toBe("Edits shared gpt-5-mini card");
    expect(pricingEditModel(snapshot, { ...draft, [snapshot]: { inputPerMillion: 0, outputPerMillion: 0 } })).toBe(snapshot);
    expect(usedPricingModels(draft, [snapshot]).has("claude-haiku-5-5-long-context")).toBe(true);
  });

  it("keeps Haiku edit identity and draft fields while a number is cleared or starts at zero", () => {
    const base = "claude-haiku-5-5";
    const high = `${base}-long-context`;
    const snapshot = `${base}-20261007`;
    for (const value of [undefined, 0, 0.12]) {
      const draft = {
        [base]: { inputPerMillion: value, outputPerMillion: 0.5, cachedInputPerMillion: 0.01 },
        [high]: { inputPerMillion: value, outputPerMillion: 2.5, cachedInputPerMillion: 0.05 },
        "claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5 },
      } as Parameters<typeof pricingRows>[0];
      expect(pricingEditModel(snapshot, draft)).toBe(base);
      expect(usedPricingModels(draft, [snapshot]).has(high)).toBe(true);
      for (const model of [snapshot, base, high]) {
        const row = pricingRows(draft, [], [snapshot]).find((item) => item.model === model)!;
        expect(row.pricing.inputPerMillion).toBe(value);
        expect(row.pricing.outputPerMillion).toBe(model === high ? 2.5 : 0.5);
        expect(row.pricing.cachedInputPerMillion).toBe(model === high ? 0.05 : 0.01);
        expect(row.sourceModel).toBe(model === high ? high : base);
      }
    }
    expect(pricingEditModel(`${snapshot}-fast-mode`, {})).toBe(`${snapshot}-fast-mode`);
  });

  it("keeps newer inherited Haiku versions tiered through incomplete edits", () => {
    const base = "claude-haiku-5-5";
    const draft = { [base]: { inputPerMillion: 0, outputPerMillion: 0.5 } };
    for (const model of ["claude-haiku-5-6", "claude-haiku-6", "copilot/claude-haiku-5.6"]) {
      expect(pricingEditModel(model, draft)).toBe(base);
      expect(pricingRowNote(pricingRows(draft, [], [model]).find((row) => row.model === model)!, draft)).toContain("Tiered by request length");
      expect(usedPricingModels(draft, [model]).has(`${base}-long-context`)).toBe(true);
      expect(pricingEditModel(model, { ...draft, [model]: { inputPerMillion: 0, outputPerMillion: 0 } })).toBe(model);
    }
  });

  it("makes request-context gaps and unpriced per-event models actionable", () => {
    const draft = { "claude-haiku-5-5": { inputPerMillion: 0.1, outputPerMillion: 0.5 } };
    expect(pricingGapReason(usage({ model: "claude-haiku-5-5", inputTokens: 300000, warnings: ["unknown_request_context"] }), draft)).toBe("missingTokenDetail");
    const warnings = ["unknown_pricing_model:aux-model"];
    expect(pricingGapReason(usage({ model: "claude-haiku-5-5", warnings }), draft)).toBe("missingPrice");
    expect(unpricedModelsFromWarnings(warnings)).toEqual(["aux-model"]);
    expect(readableWarning("unknown_request_context")).toContain("request");
    expect(readableWarning(warnings[0]!)).toContain("aux-model");
    expect(usedPricingModels(draft, ["claude-haiku-5-5"], ["aux-model"]).has("aux-model")).toBe(true);
  });

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
