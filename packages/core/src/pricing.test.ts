import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
