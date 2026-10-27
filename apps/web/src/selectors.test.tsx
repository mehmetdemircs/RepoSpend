import { describe, expect, it } from "vitest";
import type { Session } from "./app-types";
import { compactModelLabel, modelUsageRows, objectsToCsv, pricingEditModel, pricingGapReason, pricingRows, pricingRowNote, readableWarning, repoModelBreakdown, sessionDisplayTitle, sessionMatchesSearch, unpricedModelsFromWarnings, usedPricingModels } from "./selectors";

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

  it("labels a custom GPT base as a flat card only while its long-context card is untouched", () => {
    const defaults = {
      "gpt-6.1-terra": { inputPerMillion: 1, outputPerMillion: 5 },
      "gpt-6.1-terra-long-context": { inputPerMillion: 2, outputPerMillion: 7.5 },
      "claude-haiku-5-5": { inputPerMillion: 0.1, outputPerMillion: 0.5 },
      "claude-haiku-5-5-long-context": { inputPerMillion: 0.5, outputPerMillion: 2.5 },
    };
    const row = (model: string, pricing: { inputPerMillion: number; outputPerMillion: number }) => ({ model, pricing, sourceModel: model, inherited: false });

    // Unedited draft: base still tiers through the bundled long-context card.
    expect(pricingRowNote(row("gpt-6.1-terra", defaults["gpt-6.1-terra"]), { ...defaults }, defaults)).toBe("Tiered by request length · edits shared base card");

    // Custom base + untouched bundled long card: the engine prices flat — the note must say so.
    const flatDraft = { ...defaults, "gpt-6.1-terra": { inputPerMillion: 0.5, outputPerMillion: 2 } };
    expect(pricingRowNote(row("gpt-6.1-terra", flatDraft["gpt-6.1-terra"]), flatDraft, defaults)).toBe("Custom flat card · long-context card not applied");
    expect(pricingRowNote(row("gpt-6.1-terra-long-context", defaults["gpt-6.1-terra-long-context"]), flatDraft, defaults)).toBe("Not applied while the base card is a custom flat card");

    // A user-saved long-context card re-enables tiering, so the note stays tiered.
    const tieredDraft = { ...flatDraft, "gpt-6.1-terra-long-context": { inputPerMillion: 4, outputPerMillion: 16 } };
    expect(pricingRowNote(row("gpt-6.1-terra", flatDraft["gpt-6.1-terra"]), tieredDraft, defaults)).toBe("Tiered by request length · edits shared base card");
    expect(pricingRowNote(row("gpt-6.1-terra-long-context", tieredDraft["gpt-6.1-terra-long-context"]), tieredDraft, defaults)).toBeUndefined();

    // Haiku keeps its separately editable tier contract — a custom base still reprices long requests.
    const haikuDraft = { ...defaults, "claude-haiku-5-5": { inputPerMillion: 0.2, outputPerMillion: 0.5 } };
    expect(pricingRowNote(row("claude-haiku-5-5", haikuDraft["claude-haiku-5-5"]), haikuDraft, defaults)).toBe("Tiered by request length · edits shared base card");
    expect(pricingRowNote(row("claude-haiku-5-5-long-context", defaults["claude-haiku-5-5-long-context"]), haikuDraft, defaults)).toBeUndefined();

    // Without bundled defaults supplied the note falls back to the prior label.
    expect(pricingRowNote(row("gpt-6.1-terra", flatDraft["gpt-6.1-terra"]), flatDraft)).toBe("Tiered by request length · edits shared base card");
  });

  it("maps alias bases to their engine long-context card across all mapped bases", () => {
    const defaults = {
      "gpt-5.6": { inputPerMillion: 4, outputPerMillion: 20 },
      "gpt-5.6-sol": { inputPerMillion: 4, outputPerMillion: 20 },
      "gpt-5.6-sol-long-context": { inputPerMillion: 8, outputPerMillion: 30 },
      "claude-haiku-5-5": { inputPerMillion: 0.1, outputPerMillion: 0.5 },
      "claude-haiku-5-5-long-context": { inputPerMillion: 0.5, outputPerMillion: 2.5 },
    };
    const rules = [
      { baseModel: "claude-haiku-5-5", longContextModel: "claude-haiku-5-5-long-context", thresholdInputTokens: 100_000 },
      { baseModel: "gpt-5.6", longContextModel: "gpt-5.6-sol-long-context", thresholdInputTokens: 272_000 },
      { baseModel: "gpt-5.6-sol", longContextModel: "gpt-5.6-sol-long-context", thresholdInputTokens: 272_000 },
    ];
    const row = (model: string, pricing = defaults[model as keyof typeof defaults]) => ({ model, pricing, sourceModel: model, inherited: false });
    const draft = { ...defaults };

    // Raw gpt-5.6 alias row: engine prices it through the Sol long-context card.
    expect(pricingRowNote(row("gpt-5.6"), draft, defaults, rules)).toBe("Tiered by request length · edits shared base card");
    // Used raw alias and dated snapshots surface the actual card under Used models.
    expect(usedPricingModels(draft, ["gpt-5.6"], [], rules).has("gpt-5.6-sol-long-context")).toBe(true);
    expect(usedPricingModels(draft, ["gpt-5.6-sol-2026-10-26"], [], rules).has("gpt-5.6-sol-long-context")).toBe(true);

    // A customized alias base is a flat card for its own requests.
    const aliasFlat = { ...draft, "gpt-5.6": { inputPerMillion: 0.5, outputPerMillion: 2 } };
    expect(pricingRowNote(row("gpt-5.6", aliasFlat["gpt-5.6"]), aliasFlat, defaults, rules)).toBe("Custom flat card · long-context card not applied");

    // One mapped base flat does NOT make the shared card inactive: gpt-5.6-sol still tiers through it.
    const solFlat = { ...draft, "gpt-5.6-sol": { inputPerMillion: 0.5, outputPerMillion: 2 } };
    expect(pricingRowNote(row("gpt-5.6-sol-long-context"), solFlat, defaults, rules)).toBeUndefined();

    // Only when every mapped base is a custom flat card is the shared card not applied.
    const allFlat = { ...solFlat, "gpt-5.6": { inputPerMillion: 0.5, outputPerMillion: 2 } };
    expect(pricingRowNote(row("gpt-5.6-sol-long-context"), allFlat, defaults, rules)).toBe("Not applied while the base card is a custom flat card");

    // A custom long-context card re-enables tiering even while both bases are flat.
    const tiered = { ...allFlat, "gpt-5.6-sol-long-context": { inputPerMillion: 4, outputPerMillion: 16 } };
    expect(pricingRowNote(row("gpt-5.6-sol-long-context", tiered["gpt-5.6-sol-long-context"]), tiered, defaults, rules)).toBeUndefined();
    expect(pricingRowNote(row("gpt-5.6-sol", allFlat["gpt-5.6-sol"]), tiered, defaults, rules)).toBe("Tiered by request length · edits shared base card");

    // Haiku keeps its own tier contract through the same mapping.
    const haikuDraft = { ...draft, "claude-haiku-5-5": { inputPerMillion: 0.2, outputPerMillion: 0.5 } };
    expect(pricingRowNote(row("claude-haiku-5-5", haikuDraft["claude-haiku-5-5"]), haikuDraft, defaults, rules)).toBe("Tiered by request length · edits shared base card");
    expect(pricingRowNote(row("claude-haiku-5-5-long-context"), haikuDraft, defaults, rules)).toBeUndefined();
  });

  it("labels inherited GPT snapshot rows truthfully about exact-ID editing", () => {
    const defaults = {
      "gpt-5.6-sol": { inputPerMillion: 4, outputPerMillion: 20 },
      "gpt-5.6-sol-long-context": { inputPerMillion: 8, outputPerMillion: 30 },
      "gpt-5.6": { inputPerMillion: 4, outputPerMillion: 20 },
    };
    const rules = [
      { baseModel: "gpt-5.6", longContextModel: "gpt-5.6-sol-long-context", thresholdInputTokens: 272_000 },
      { baseModel: "gpt-5.6-sol", longContextModel: "gpt-5.6-sol-long-context", thresholdInputTokens: 272_000 },
    ];
    const draft = { ...defaults };
    const dated = "gpt-5.6-sol-2026-07-30";
    const row = (model: string, sourceModel = model, inherited = false, pricing = draft[model as keyof typeof draft]) => ({ model, pricing, sourceModel, inherited });

    // Editing a dated row writes an exact-ID card (pricingEditModel keeps the raw id),
    // so the note must not claim a shared tiered edit.
    expect(pricingEditModel(dated, draft)).toBe(dated);
    const datedDefault = pricingRows(draft, [{ id: dated } as never], []);
    expect(pricingRowNote(datedDefault.find((item) => item.model === dated)!, draft, defaults, rules))
      .toBe("Uses gpt-5.6-sol pricing · tiered · editing creates a flat exact-ID card");

    // A custom flat canonical base makes inherited dated rows flat too.
    const flatBase = { ...draft, "gpt-5.6-sol": { inputPerMillion: 0.5, outputPerMillion: 2 } };
    expect(pricingRowNote(pricingRows(flatBase, [{ id: dated } as never], []).find((item) => item.model === dated)!, flatBase, defaults, rules))
      .toBe("Uses gpt-5.6-sol pricing · custom flat · editing creates a flat exact-ID card");

    // Editing the long-context card re-enables tiering for inherited rows.
    const customLc = { ...flatBase, "gpt-5.6-sol-long-context": { inputPerMillion: 4, outputPerMillion: 16 } };
    expect(pricingRowNote(pricingRows(customLc, [{ id: dated } as never], []).find((item) => item.model === dated)!, customLc, defaults, rules))
      .toBe("Uses gpt-5.6-sol pricing · tiered · editing creates a flat exact-ID card");

    // Provider-prefixed used IDs resolve to the shared base and truly edit it.
    expect(pricingEditModel("copilot/gpt-5.6-sol", draft)).toBe("gpt-5.6-sol");
    const copilotRow = pricingRows(draft, [{ id: "copilot/gpt-5.6-sol" } as never], []).find((item) => item.model === "copilot/gpt-5.6-sol")!;
    expect(pricingRowNote(copilotRow, draft, defaults, rules)).toBe("Tiered by request length · edits shared base card");

    // Once edited, the exact card is clearly flat — no shared-tier claim.
    const exactDraft = { ...draft, [dated]: { inputPerMillion: 1, outputPerMillion: 3 } };
    expect(pricingEditModel(dated, exactDraft)).toBe(dated);
    expect(pricingRowNote(row(dated), exactDraft, defaults, rules)).toBe("Explicit custom card · flat rates");
  });

  it("breaks a mixed-model repo session into its model slices", () => {
    const slice = (model: string, inputTokens: number, outputTokens: number, estimatedCostUsd: number | undefined) => ({
      model,
      requestCount: 1,
      inputTokens,
      cachedInputTokens: 0,
      cacheCreationInputTokens: 0,
      outputTokens,
      reasoningTokens: 0,
      totalTokens: inputTokens + outputTokens,
      estimatedCostUsd,
    });
    const mixed = usage({
      id: "mixed",
      model: "gpt-6-astra",
      inputTokens: 200_000,
      outputTokens: 20_000,
      totalTokens: 220_000,
      estimatedCostUsd: 1.8,
      modelUsage: [slice("gpt-6-astra", 100_000, 10_000, 1.5), slice("gpt-6-sol", 100_000, 10_000, 0.3)],
    });
    const unpriced = usage({
      id: "unpriced",
      model: "custom-model",
      totalTokens: 50,
      estimatedCostUsd: undefined,
      modelUsage: [slice("custom-model", 40, 10, undefined)],
    });
    const legacy = usage({ id: "legacy", model: "gpt-5", totalTokens: 30, estimatedCostUsd: 0.01 });
    const repo = { id: "/tmp/repo", label: "repo", estimatedCostUsd: 2.1 } as Parameters<typeof repoModelBreakdown>[1];

    const rows = repoModelBreakdown([mixed, unpriced, legacy], repo);
    const astra = rows.find((entry) => entry.id === "gpt-6-astra");
    const sol = rows.find((entry) => entry.id === "gpt-6-sol");
    const custom = rows.find((entry) => entry.id === "custom-model");
    const gpt5 = rows.find((entry) => entry.id === "gpt-5");
    expect(astra?.estimatedCostUsd).toBe(1.5);
    expect(astra?.totalTokens).toBe(110_000);
    expect(astra?.sessionCount).toBe(1);
    expect(sol?.estimatedCostUsd).toBe(0.3);
    expect(sol?.totalTokens).toBe(110_000);
    expect(sol?.costShare).toBeCloseTo(0.3 / 2.1, 5);
    expect(custom?.estimatedCostUsd).toBeUndefined();
    expect(custom?.totalTokens).toBe(50);
    expect(gpt5?.estimatedCostUsd).toBe(0.01);
    expect(gpt5?.totalTokens).toBe(30);
  });

  it("ranks a model's top repo by that model's slices, not whole-session spend", () => {
    const slice = (model: string, inputTokens: number, outputTokens: number, estimatedCostUsd: number) => ({
      model,
      requestCount: 1,
      inputTokens,
      cachedInputTokens: 0,
      cacheCreationInputTokens: 0,
      outputTokens,
      reasoningTokens: 0,
      totalTokens: inputTokens + outputTokens,
      estimatedCostUsd,
    });
    // Repo A's session is mostly Sol spend; only $0.01 of Astra. Repo B is a small
    // session that is entirely Astra at $5. Whole-session ranking would wrongly crown A.
    const repoASession = usage({
      id: "repo-a-session",
      repoRoot: "/repos/a",
      repoName: "repo-a",
      model: "gpt-6-sol",
      inputTokens: 9_010,
      outputTokens: 1_000,
      totalTokens: 10_010,
      estimatedCostUsd: 90.01,
      modelUsage: [slice("gpt-6-sol", 9_000, 990, 90), slice("gpt-6-astra", 10, 10, 0.01)],
    });
    const repoBSession = usage({
      id: "repo-b-session",
      repoRoot: "/repos/b",
      repoName: "repo-b",
      model: "gpt-6-astra",
      inputTokens: 400,
      outputTokens: 100,
      totalTokens: 500,
      estimatedCostUsd: 5,
      modelUsage: [slice("gpt-6-astra", 400, 100, 5)],
    });
    const data = {
      repos: [
        { id: "/repos/a", label: "repo-a", sessionCount: 1, totalTokens: 10_010, estimatedCostUsd: 90.01 },
        { id: "/repos/b", label: "repo-b", sessionCount: 1, totalTokens: 500, estimatedCostUsd: 5 },
      ],
      models: [{ id: "gpt-6-astra", label: "gpt-6-astra", sessionCount: 2, inputTokens: 410, cachedInputTokens: 0, outputTokens: 110, totalTokens: 520, estimatedCostUsd: 5.01 }],
      sessions: [repoASession, repoBSession],
    } as unknown as Parameters<typeof modelUsageRows>[0];

    const astra = modelUsageRows(data).find((row) => row.id === "gpt-6-astra");
    expect(astra?.topRepo?.id).toBe("/repos/b");
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
