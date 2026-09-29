import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizePricingModelId, resolvePricingForModel } from "@repospend/types";
import { afterEach, describe, expect, it } from "vitest";
import { calculateCostUsd, defaultPricing, loadPricingTable, pricingOverrides, savePricingTable } from "./pricing.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("pricing persistence", () => {
  it("persists only custom or intentionally changed rows", () => {
    const custom = {
      inputPerMillion: 0.5,
      cachedInputPerMillion: 0.05,
      outputPerMillion: 2,
    };
    const pricing = {
      ...defaultPricing,
      "gpt-5.6-luna": { ...defaultPricing["gpt-5.6-luna"]!, outputPerMillion: 1.3 },
      "custom-model": custom,
    };

    expect(pricingOverrides(pricing)).toEqual({
      "gpt-5.6-luna": { ...defaultPricing["gpt-5.6-luna"]!, outputPerMillion: 1.3 },
      "custom-model": custom,
    });
  });

  it("migrates a legacy full pricing file to the current Terra and Luna defaults", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "repospend-pricing-"));
    tempDirs.push(directory);
    const pricingPath = path.join(directory, "pricing.json");
    const newModels = new Set(["gpt-6-astra", "gpt-6-sol", "gpt-6-luna", "claude-fable-5-1", "claude-mythos-5-1", "claude-opus-5-5", "claude-opus-5"]);
    const previousBundledRows = Object.fromEntries(Object.entries(defaultPricing).filter(([model]) => !newModels.has(model)));
    const legacyFullTable = {
      ...previousBundledRows,
      "gpt-5.6-terra": { inputPerMillion: 2.5, cachedInputPerMillion: 0.25, cacheCreationInputPerMillion: 3.125, outputPerMillion: 15, reasoningOutputPerMillion: 15 },
      "gpt-5.6-luna": { inputPerMillion: 1, cachedInputPerMillion: 0.1, cacheCreationInputPerMillion: 1.25, outputPerMillion: 6, reasoningOutputPerMillion: 6 },
      "claude-sonnet-5": { ...defaultPricing["claude-sonnet-5"], note: "Anthropic introductory pricing through August 31, 2026. Standard pricing from September 1, 2026 is $3 input / $15 output per 1M tokens." },
    };
    fs.writeFileSync(pricingPath, `${JSON.stringify(legacyFullTable)}\n`);

    const loaded = loadPricingTable(pricingPath);

    expect(loaded["gpt-5.6-terra"]).toEqual(defaultPricing["gpt-5.6-terra"]);
    expect(loaded["gpt-5.6-luna"]).toEqual(defaultPricing["gpt-5.6-luna"]);
    expect(loaded["claude-sonnet-5"]).toEqual(defaultPricing["claude-sonnet-5"]);
    expect(loaded["gpt-6-astra"]).toEqual(defaultPricing["gpt-6-astra"]);
    expect(loaded["claude-opus-5-5"]).toEqual(defaultPricing["claude-opus-5-5"]);
  });

  it("preserves a sparse user override instead of treating it as a legacy full table", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "repospend-pricing-"));
    tempDirs.push(directory);
    const pricingPath = path.join(directory, "pricing.json");
    const override = { inputPerMillion: 0.1, outputPerMillion: 0.8 };
    savePricingTable(pricingPath, { "gpt-5.6-luna": override });

    expect(loadPricingTable(pricingPath)["gpt-5.6-luna"]).toEqual(override);
  });
});

describe("GPT-6.1 Sol pricing", () => {
  const usage = (model: string) => ({ model, inputTokens: 1_400_000, cachedInputTokens: 200_000, cacheCreationInputTokens: 200_000, outputTokens: 300_000, reasoningTokens: 100_000 });

  it.each(["gpt-6.1-sol", "GPT-6.1-SOL", "copilot/gpt-6.1-sol", "gpt-6.1-sol-2026-09-29", "gpt-6.1-sol-20260929"])("uses the explicit card for %s", (model) => {
    expect(resolvePricingForModel(model, defaultPricing).sourceModel).toBe("gpt-6.1-sol");
    expect(calculateCostUsd(usage(model), defaultPricing)).toBe(6.52);
  });

  it("keeps GPT-6 Sol's original cache rate and inherits the newest same-tier card for future Sol versions", () => {
    expect(calculateCostUsd(usage("gpt-6-sol"), defaultPricing)).toBe(6.54);
    expect(resolvePricingForModel("gpt-6.2-sol", defaultPricing)).toMatchObject({ sourceModel: "gpt-6.1-sol", inherited: true });
    expect(resolvePricingForModel("gpt-6.1-astra", defaultPricing).sourceModel).toBe("gpt-6-astra");
    expect(calculateCostUsd(usage("gpt-6.1-sol-fast-mode"), defaultPricing)).toBeUndefined();
  });

  it("adds the new card to saved tables and preserves custom base and snapshot overrides", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repospend-sol61-"));
    tempDirs.push(dir);
    const file = path.join(dir, "pricing.json");
    const custom = { inputPerMillion: 3, cachedInputPerMillion: 0.3, outputPerMillion: 12 };
    savePricingTable(file, { "gpt-6-sol": custom });
    expect(loadPricingTable(file)["gpt-6.1-sol"]).toMatchObject({ inputPerMillion: 2, cachedInputPerMillion: 0.1, cacheCreationInputPerMillion: 2.5, outputPerMillion: 10 });
    expect(loadPricingTable(file)["gpt-6.1-sol"]).toEqual(defaultPricing["gpt-6.1-sol"]);
    expect(loadPricingTable(file)["gpt-6-sol"]).toEqual(custom);
    savePricingTable(file, { "gpt-6.1-sol": custom });
    expect(loadPricingTable(file)["gpt-6.1-sol"]).toEqual(custom);
    const snapshot = "gpt-6.1-sol-2026-09-29";
    for (const model of [snapshot, snapshot.toUpperCase(), `copilot/${snapshot}`, `copilot/${snapshot.toUpperCase()}`]) {
      expect(resolvePricingForModel(model, { ...defaultPricing, [snapshot]: custom })).toMatchObject({ pricing: custom, sourceModel: snapshot, inherited: false });
    }
    expect(normalizePricingModelId(`copilot/${snapshot.toUpperCase()}`)).toBe(snapshot);
  });
});

describe("new model pricing", () => {
  const usageFor = (model: string) => ({
    model,
    inputTokens: 1_400_000,
    cachedInputTokens: 200_000,
    cacheCreationInputTokens: 200_000,
    cacheCreationInputTokens5m: 100_000,
    cacheCreationInputTokens1h: 100_000,
    outputTokens: 300_000,
    reasoningTokens: 100_000,
  });

  it("uses exact GPT-6 Standard short-context rates across token buckets", () => {
    expect(calculateCostUsd(usageFor("gpt-6-astra"), defaultPricing)).toBe(32.7);
    expect(calculateCostUsd(usageFor("gpt-6-sol"), defaultPricing)).toBe(6.54);
    expect(calculateCostUsd(usageFor("gpt-6-luna"), defaultPricing)).toBe(0.327);
  });

  it("uses the new Claude cache-read rates and dated model IDs", () => {
    expect(calculateCostUsd(usageFor("claude-fable-5-1"), defaultPricing)).toBe(33.3);
    expect(calculateCostUsd(usageFor("claude-fable-5-1-20260901"), defaultPricing)).toBe(33.3);
    expect(calculateCostUsd(usageFor("claude-mythos-5-1"), defaultPricing)).toBe(33.3);
    expect(calculateCostUsd(usageFor("claude-opus-5-5"), defaultPricing)).toBe(13.34);
    expect(calculateCostUsd(usageFor("claude-opus-5-5-20260922"), defaultPricing)).toBe(13.34);
  });
});


describe("September 28 pricing refresh", () => {
  const usage = (model: string) => ({ model, inputTokens: 1_300_000, cachedInputTokens: 200_000, cacheCreationInputTokens: 100_000, outputTokens: 300_000, reasoningTokens: 100_000 });
  it("uses promotional Sol pricing and its alias", () => {
    expect(calculateCostUsd(usage("gpt-5.6-sol"), defaultPricing)).toBe(12.58);
    expect(calculateCostUsd(usage("gpt-5.6"), defaultPricing)).toBe(12.58);
  });
  it.each(["claude-sonnet-5-5", "claude-sonnet-5.5", "claude-sonnet-5-5-20260928", "copilot/claude-sonnet-5.5"])("resolves %s to the explicit Sonnet 5.5 card", (model) => {
    expect(resolvePricingForModel(model, defaultPricing).sourceModel).toBe("claude-sonnet-5-5");
    expect(calculateCostUsd(usage(model), defaultPricing)).toBe(6.44);
  });
  it.each([
    ["gemini-3.6-flash", 2.34], ["gemini-3.7-flash", 2.34], ["gemini-3.8-flash", 2.34],
    ["mai-code-1.1-flash", 0.704], ["grok-4.5", 4.7], ["grok-4.6", 4.7], ["grok-4.7", 4.7], ["kimi-k3", 9.36],
  ])("prices Copilot alias %s", (model, cost) => {
    expect(calculateCostUsd(usage(`copilot/${model}-preview`), defaultPricing)).toBe(cost);
  });
  it.each(["claude-opus-5-5-fast-mode", "claude-opus-5.5-fast-mode", "claude-opus-5-5-20260922-fast-mode"])("prices fast cache buckets for %s", (model) => {
    expect(calculateCostUsd({ model, inputTokens: 1_400_000, cachedInputTokens: 200_000, cacheCreationInputTokens: 200_000, cacheCreationInputTokens5m: 100_000, cacheCreationInputTokens1h: 100_000, outputTokens: 300_000, reasoningTokens: 0 }, defaultPricing)).toBe(22.68);
  });
  it("migrates old Sol defaults in a full settings file but preserves custom rates", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repospend-sol-")); tempDirs.push(dir);
    const file = path.join(dir, "pricing.json");
    const oldSol = { inputPerMillion: 5, cachedInputPerMillion: 0.5, cacheCreationInputPerMillion: 6.25, outputPerMillion: 30, reasoningOutputPerMillion: 30 };
    const oldAlias = { ...oldSol, note: "GPT-5.6 Sol flagship tier. OpenAI preview pricing lists Sol at $5 input / $30 output per 1M tokens, cache writes at 1.25x input, and cache reads at a 90% discount." };
    savePricingTable(file, { ...defaultPricing, "gpt-5.6-sol": oldSol, "gpt-5.6": oldAlias });
    expect(loadPricingTable(file)["gpt-5.6-sol"]).toEqual(defaultPricing["gpt-5.6-sol"]);
    expect(loadPricingTable(file)["gpt-5.6"]).toEqual(defaultPricing["gpt-5.6"]);
    savePricingTable(file, { "gpt-5.6-sol": oldSol, "gpt-5.6": oldAlias });
    expect(loadPricingTable(file)["gpt-5.6-sol"]).toEqual(oldSol);
    expect(loadPricingTable(file)["gpt-5.6"]).toEqual(oldAlias);
    savePricingTable(file, { ...defaultPricing, "gpt-5.6-sol": { ...oldSol, outputPerMillion: 22 } });
    expect(loadPricingTable(file)["gpt-5.6-sol"]?.outputPerMillion).toBe(22);
  });
});


describe("Claude snapshot version matching", () => {
  it.each([["claude-opus-4-5@20251101", "claude-opus-4-5"], ["claude-haiku-4-5@20251001", "claude-haiku-4-5"], ["claude-opus-4-6[1m]", "claude-opus-4-6"]])("preserves version before a provider suffix in %s", (model, sourceModel) => {
    expect(resolvePricingForModel(model, defaultPricing).sourceModel).toBe(sourceModel);
  });
  it.each([["claude-opus-4-20250514", 22.5, "claude-opus-4"], ["claude-sonnet-4-20250514", 4.5, "claude-sonnet-4"], ["claude-sonnet-5-20260630", 3, "claude-sonnet-5"]])("keeps %s in its own generation", (model, cost, sourceModel) => {
    expect(calculateCostUsd({ model, inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 100_000, reasoningTokens: 0 }, defaultPricing)).toBe(cost);
    expect(resolvePricingForModel(model, defaultPricing).sourceModel).toBe(sourceModel);
  });
});
