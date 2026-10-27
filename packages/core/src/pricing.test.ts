import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizePricingModelId, resolvePricingForModel } from "@repospend/types";
import { afterEach, describe, expect, it } from "vitest";
import { calculateCostUsd, calculateRequestCosts, calculateRequestCostsUsd, defaultPricing, loadPricingTable, pricingOverrides, savePricingTable } from "./pricing.js";

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
    expect(calculateCostUsd(usage(model), defaultPricing)).toBe(6.42);
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

describe("October pricing corrections", () => {
  const usage = (model: string, inputTokens = 100_000) => ({ model, inputTokens, cachedInputTokens: 20_000, cacheCreationInputTokens: 20_000, cacheCreationInputTokens5m: 10_000, cacheCreationInputTokens1h: 10_000, outputTokens: 10_000, reasoningTokens: 0 });

  it.each(["claude-haiku-5-5", "CLAUDE-HAIKU-5.5", "claude-haiku-5-5-20261007", "copilot/claude-haiku-5.5"])("prices %s at the exact 100K boundary and above it", (model) => {
    expect(resolvePricingForModel(model, defaultPricing).sourceModel).toBe("claude-haiku-5-5");
    expect(calculateCostUsd(usage(model), defaultPricing, 100_000)).toBe(0.01445);
    expect(calculateCostUsd(usage(model, 100_001), defaultPricing, 100_001)).toBe(0.072251);
    expect(calculateCostUsd(usage(model), defaultPricing)).toBeUndefined();
    expect(calculateCostUsd(usage(`${model}-fast-mode`), defaultPricing, 100_000)).toBeUndefined();
  });

  it("sums request prices without applying a tier to the session or rounding each request", () => {
    const requests = Array.from({ length: 100 }, () => ({ ...usage("claude-haiku-5-5", 2), cachedInputTokens: 0, cacheCreationInputTokens: 0, cacheCreationInputTokens5m: 0, cacheCreationInputTokens1h: 0, outputTokens: 0, requestInputTokens: 2 }));
    expect(calculateRequestCostsUsd(requests, defaultPricing)).toBe(0.00002);
    expect(calculateRequestCostsUsd([usage("unknown")], defaultPricing)).toBeUndefined();
    expect(calculateRequestCosts([usage("claude-haiku-5-5")], defaultPricing).warnings).toEqual(["unknown_request_context"]);
  });

  it("keeps custom snapshot overrides and separately editable long-context rates", () => {
    const snapshot = "claude-haiku-5-5-20261007";
    const custom = { inputPerMillion: 7, outputPerMillion: 9 };
    expect(calculateCostUsd({ ...usage(snapshot), cachedInputTokens: 0, cacheCreationInputTokens: 0, cacheCreationInputTokens5m: 0, cacheCreationInputTokens1h: 0 }, { ...defaultPricing, [snapshot]: custom })).toBe(0.79);
    expect(calculateCostUsd(usage("claude-haiku-5-5"), { ...defaultPricing, "claude-haiku-5-5-long-context": { ...defaultPricing["claude-haiku-5-5-long-context"]!, outputPerMillion: 3 } }, 100_001)).toBe(0.07725);
  });

  it("corrects only Sonnet 5.5 and adds Gemini Argon aliases", () => {
    expect(defaultPricing["claude-sonnet-5-5"]?.cachedInputPerMillion).toBe(0.1);
    expect(defaultPricing["claude-sonnet-5"]?.cachedInputPerMillion).toBe(0.2);
    for (const model of ["gemini-4-argon", "copilot/gemini-4-argon-preview"]) {
      expect(resolvePricingForModel(model, defaultPricing).sourceModel).toBe("gemini-4-argon");
      expect(calculateCostUsd({ ...usage(model), cacheCreationInputTokens: 0, cacheCreationInputTokens5m: 0, cacheCreationInputTokens1h: 0 }, defaultPricing)).toBe(0.262);
    }
  });

  it("migrates stale Sonnet defaults only in legacy full tables and keeps custom rows", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "repospend-october-"));
    tempDirs.push(directory);
    const file = path.join(directory, "pricing.json");
    const oldSonnet = { ...defaultPricing["claude-sonnet-5-5"]!, cachedInputPerMillion: 0.2 };
    savePricingTable(file, { ...defaultPricing, "claude-sonnet-5-5": oldSonnet });
    expect(loadPricingTable(file)["claude-sonnet-5-5"]?.cachedInputPerMillion).toBe(0.1);
    savePricingTable(file, { "claude-sonnet-5-5": oldSonnet });
    expect(loadPricingTable(file)["claude-sonnet-5-5"]).toEqual(oldSonnet);
    const custom = { ...oldSonnet, outputPerMillion: 7 };
    savePricingTable(file, { ...defaultPricing, "claude-sonnet-5-5": custom });
    expect(loadPricingTable(file)["claude-sonnet-5-5"]).toEqual(custom);
    expect(pricingOverrides(defaultPricing)).toEqual({});
  });

  it("keeps Haiku's separately editable tiers when only the base card is customized", () => {
    const pricing = { ...defaultPricing, "claude-haiku-5-5": { ...defaultPricing["claude-haiku-5-5"]!, inputPerMillion: 0.2 } };
    // The canonical flat-override exception is a GPT-only policy: Haiku keeps its
    // established contract — a customized base plus the unchanged long-context card
    // still reprices large requests at the long tier (0.15 + 0.025), not flat (0.065).
    expect(calculateCostUsd({ model: "claude-haiku-5-5", inputTokens: 300_000, cachedInputTokens: 0, cacheCreationInputTokens: 0, cacheCreationInputTokens5m: 0, cacheCreationInputTokens1h: 0, outputTokens: 10_000, reasoningTokens: 0 }, pricing, 300_000)).toBe(0.175);
    // Unknown request lengths stay unpriced, and an exact custom snapshot keeps its flat authority.
    expect(calculateCostUsd(usage("claude-haiku-5-5"), pricing)).toBeUndefined();
    const snapshot = { "claude-haiku-5-5-20261007": { inputPerMillion: 7, outputPerMillion: 9 } };
    expect(calculateCostUsd({ model: "claude-haiku-5-5-20261007", inputTokens: 300_000, cachedInputTokens: 0, cacheCreationInputTokens: 0, cacheCreationInputTokens5m: 0, cacheCreationInputTokens1h: 0, outputTokens: 10_000, reasoningTokens: 0 }, { ...defaultPricing, ...snapshot }, 300_000)).toBe(2.19);
  });

  it("does not let an invalid internal context card inherit the base tier", () => {
    const high = "claude-haiku-5-5-long-context";
    const pricing = { ...defaultPricing, [high]: { ...defaultPricing[high]!, inputPerMillion: 0 } };
    expect(resolvePricingForModel(high, pricing).inherited).toBe(false);
    expect(resolvePricingForModel(high, pricing).sourceModel).not.toBe("claude-haiku-5-5");
  });

  it("does not fall back to an internal context card or older generation when the base card is invalid", () => {
    const pricing = { ...defaultPricing, "claude-haiku-5-5": { ...defaultPricing["claude-haiku-5-5"]!, inputPerMillion: 0 } };
    expect(resolvePricingForModel("claude-haiku-5-5", pricing).sourceModel).not.toBe("claude-haiku-5-5-long-context");
    expect(calculateCostUsd(usage("claude-haiku-5-5"), pricing)).toBeUndefined();
    expect(calculateCostUsd(usage("claude-haiku-5-5"), pricing, 100_000)).toBeUndefined();
    expect(calculateCostUsd(usage("copilot/claude-haiku-5.5-20261007"), pricing)).toBeUndefined();
  });
});


describe("GPT-6.1 Terra pricing", () => {
  const usage = (model: string, inputTokens = 100_000) => ({
    model,
    inputTokens,
    cachedInputTokens: 80_000,
    cacheCreationInputTokens: 15_000,
    outputTokens: 10_000,
    reasoningTokens: 0,
  });

  it.each(["gpt-6.1-terra", "GPT-6.1-TERRA", "copilot/gpt-6.1-terra", "gpt-6.1-terra-2026-10-26", "gpt-6.1-terra-20261026"])("uses the explicit card for %s", (model) => {
    expect(resolvePricingForModel(model, defaultPricing).sourceModel).toBe("gpt-6.1-terra");
    // billable input 5K * 1 + cached 80K * 0.05 + generic write 15K * 1.25 + output 10K * 5
    expect(calculateCostUsd(usage(model), defaultPricing)).toBe(0.07775);
  });

  it("does not inherit the older 5.6 Terra card", () => {
    const resolution = resolvePricingForModel("gpt-6.1-terra", defaultPricing);
    expect(resolution.pricing.inputPerMillion).toBe(1);
    expect(resolution.pricing.outputPerMillion).toBe(5);
    expect(resolution.pricing.inputPerMillion).not.toBe(defaultPricing["gpt-5.6-terra"]!.inputPerMillion);
  });

  it("prices 30m and 12h cache writes at their own rates", () => {
    expect(
      calculateCostUsd(
        { ...usage("gpt-6.1-terra"), cacheCreationInputTokens30m: 10_000, cacheCreationInputTokens12h: 5_000 },
        defaultPricing,
      ),
    ).toBe(0.084);
  });

  it("prefers an exact custom Terra row over bundled defaults and never invents a long-context card", () => {
    const custom = { inputPerMillion: 0.5, outputPerMillion: 2 };
    const pricing = { ...defaultPricing, "gpt-6.1-terra": custom };
    expect(resolvePricingForModel("gpt-6.1-terra", pricing).pricing).toEqual(custom);
    expect(calculateCostUsd({ model: "gpt-6.1-terra", inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 100_000, reasoningTokens: 0 }, pricing)).toBe(0.7);
  });
});

describe("OpenAI request-level long-context pricing", () => {
  const request = (model: string, inputTokens: number) => ({ model, inputTokens, cachedInputTokens: 0, outputTokens: 10_000, reasoningTokens: 0, requestInputTokens: inputTokens });

  it("prices GPT-6.1 Sol requests at the long-context tier only above 272K input tokens", () => {
    expect(calculateRequestCostsUsd([request("gpt-6.1-sol", 300_000)], defaultPricing)).toBe(1.35);
    expect(calculateRequestCostsUsd([request("gpt-6.1-sol", 272_000)], defaultPricing)).toBe(0.644);
    expect(calculateRequestCostsUsd([request("gpt-6.1-sol", 272_001)], defaultPricing)).toBe(1.238004);
  });

  it("applies the long-context card to Terra requests in both GPT generations", () => {
    expect(calculateRequestCostsUsd([request("gpt-6.1-terra", 300_000)], defaultPricing)).toBe(0.675);
    expect(calculateRequestCostsUsd([request("gpt-5.6-terra", 300_000)], defaultPricing)).toBe(1.38);
  });

  it("applies the published GPT-5.x long-context tiers strictly above 272K input tokens", () => {
    // gpt-5.6-sol: short 272K = 272K*4 + 10K*20 = 1.288; long = 272001*8 + 10K*30.
    expect(calculateRequestCostsUsd([request("gpt-5.6-sol", 272_000)], defaultPricing)).toBe(1.288);
    expect(calculateRequestCostsUsd([request("gpt-5.6-sol", 272_001)], defaultPricing)).toBe(2.476008);
    expect(calculateRequestCostsUsd([request("gpt-5.6-terra", 300_000)], defaultPricing)).toBe(1.38);
    expect(calculateRequestCostsUsd([request("gpt-5.6-luna", 300_000)], defaultPricing)).toBe(0.138);
    expect(calculateRequestCostsUsd([request("gpt-5.5", 300_000)], defaultPricing)).toBe(3.45);
    expect(calculateRequestCostsUsd([request("gpt-5.5-pro", 300_000)], defaultPricing)).toBe(20.7);
    expect(calculateRequestCostsUsd([request("gpt-5.4", 300_000)], defaultPricing)).toBe(1.725);
    expect(calculateRequestCostsUsd([request("gpt-5.4-pro", 300_000)], defaultPricing)).toBe(20.7);
    // mini/nano have no published long-context tier and stay flat.
    expect(calculateRequestCostsUsd([request("gpt-5.4-mini", 300_000)], defaultPricing)).toBe(0.27);
    expect(calculateRequestCostsUsd([request("gpt-5.4-nano", 300_000)], defaultPricing)).toBe(0.0725);
  });

  it("applies the Sol long-context card through the gpt-5.6 alias and dated snapshots", () => {
    for (const model of ["gpt-5.6", "gpt-5.6-sol-2026-10-26", "gpt-5.6-sol-20261026", "copilot/gpt-5.6-sol"]) {
      expect(calculateRequestCostsUsd([request(model, 300_000)], defaultPricing)).toBe(2.7);
    }
  });

  it("keeps a canonical custom flat override above 272K on GPT-5.x cards and honors a custom long card", () => {
    const pricing = { ...defaultPricing, "gpt-5.6-sol": { inputPerMillion: 0.5, outputPerMillion: 2 } };
    expect(calculateRequestCostsUsd([request("gpt-5.6-sol", 300_000)], pricing)).toBe(0.17);
    const tiered = { ...pricing, "gpt-5.6-sol-long-context": { inputPerMillion: 4, outputPerMillion: 16 } };
    expect(calculateRequestCostsUsd([request("gpt-5.6-sol", 300_000)], tiered)).toBe(1.36);
  });

  it("flags unknown request length at short-context rates and a missing long card on GPT-5.x", () => {
    const unknown = calculateRequestCosts([{ ...request("gpt-5.6-terra", 100_000), requestInputTokens: undefined }], defaultPricing);
    expect(unknown.costUsd).toBe(0.32);
    expect(unknown.assumptions).toEqual(["assumed_short_context_rates:gpt-5.6-terra"]);
    const pricing = { ...defaultPricing };
    delete pricing["gpt-5.4-long-context"];
    const missing = calculateRequestCosts([request("gpt-5.4", 300_000)], pricing);
    expect(missing.costUsd).toBe(0.9);
    expect(missing.assumptions).toEqual(["missing_long_context_pricing:gpt-5.4"]);
  });

  it("assumes short-context rates and flags usage when request size is unknown", () => {
    const result = calculateRequestCosts([{ ...request("gpt-6-sol", 100_000), requestInputTokens: undefined }], defaultPricing);
    expect(result.costUsd).toBe(0.3);
    expect(result.assumptions).toEqual(["assumed_short_context_rates:gpt-6-sol"]);
  });

  it("falls back to base rates with an assumption when a saved table lacks the long-context card", () => {
    const pricing = { ...defaultPricing };
    delete pricing["gpt-6.1-terra-long-context"];
    const result = calculateRequestCosts([request("gpt-6.1-terra", 300_000)], pricing);
    expect(result.costUsd).toBe(0.35);
    expect(result.assumptions).toEqual(["missing_long_context_pricing:gpt-6.1-terra"]);
  });

  it("uses a custom long-context row when the user saved one", () => {
    const pricing = { ...defaultPricing, "gpt-6.1-terra-long-context": { inputPerMillion: 10, outputPerMillion: 40 } };
    expect(calculateRequestCostsUsd([request("gpt-6.1-terra", 300_000)], pricing)).toBe(3.4);
  });

  it("preserves a canonical custom flat override instead of selecting the bundled long-context card", () => {
    const pricing = { ...defaultPricing, "gpt-6.1-terra": { inputPerMillion: 0.5, outputPerMillion: 2 } };
    // 300K * 0.5 + 10K * 2 with the user's flat card — not 0.675 at bundled long-context rates.
    expect(calculateRequestCostsUsd([request("gpt-6.1-terra", 300_000)], pricing)).toBe(0.17);
    expect(calculateRequestCostsUsd([request("gpt-6.1-terra", 100_000)], pricing)).toBe(0.07);
  });

  it("keeps flat overrides loaded from a sparse saved pricing file", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "repospend-pricing-"));
    tempDirs.push(directory);
    const pricingPath = path.join(directory, "pricing.json");
    savePricingTable(pricingPath, { "gpt-6.1-terra": { inputPerMillion: 0.5, outputPerMillion: 2 } });

    const loaded = loadPricingTable(pricingPath);
    expect(loaded["gpt-6.1-terra"]).toEqual({ inputPerMillion: 0.5, outputPerMillion: 2 });
    expect(calculateRequestCostsUsd([request("gpt-6.1-terra", 300_000)], loaded)).toBe(0.17);
  });

  it("keeps an exact custom snapshot flat at long-context sizes", () => {
    const pricing = { ...defaultPricing, "gpt-6.1-terra-2026-10-26": { inputPerMillion: 0.5, outputPerMillion: 2 } };
    expect(calculateRequestCostsUsd([request("gpt-6.1-terra-2026-10-26", 300_000)], pricing)).toBe(0.17);
  });

  it("still tiers when the user also customized the long-context card", () => {
    const pricing = {
      ...defaultPricing,
      "gpt-6.1-terra": { inputPerMillion: 0.5, outputPerMillion: 2 },
      "gpt-6.1-terra-long-context": { inputPerMillion: 4, outputPerMillion: 16 },
    };
    expect(calculateRequestCostsUsd([request("gpt-6.1-terra", 300_000)], pricing)).toBe(1.36);
  });

  it("carries the canonical flat override through dated, compact-date, and provider-prefixed aliases", () => {
    const pricing = { ...defaultPricing, "gpt-6.1-terra": { inputPerMillion: 0.5, outputPerMillion: 2 } };
    for (const model of ["gpt-6.1-terra", "gpt-6.1-terra-2026-10-26", "gpt-6.1-terra-20261026", "copilot/gpt-6.1-terra", "github_copilot/gpt-6.1-terra"]) {
      expect(calculateRequestCostsUsd([request(model, 300_000)], pricing), model).toBe(0.17);
    }
  });

  it("carries the saved canonical flat override through aliases after loadPricingTable", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "repospend-pricing-"));
    tempDirs.push(directory);
    const pricingPath = path.join(directory, "pricing.json");
    savePricingTable(pricingPath, { "gpt-6.1-terra": { inputPerMillion: 0.5, outputPerMillion: 2 } });
    const loaded = loadPricingTable(pricingPath);
    for (const model of ["gpt-6.1-terra-2026-10-26", "copilot/gpt-6.1-terra"]) {
      expect(calculateRequestCostsUsd([request(model, 300_000)], loaded), model).toBe(0.17);
    }
  });

  it("keeps alias forms tiered when the user saved a custom long-context card", () => {
    const pricing = {
      ...defaultPricing,
      "gpt-6.1-terra": { inputPerMillion: 0.5, outputPerMillion: 2 },
      "gpt-6.1-terra-long-context": { inputPerMillion: 4, outputPerMillion: 16 },
    };
    expect(calculateRequestCostsUsd([request("gpt-6.1-terra-2026-10-26", 300_000)], pricing)).toBe(1.36);
    expect(calculateRequestCostsUsd([request("copilot/gpt-6.1-terra", 300_000)], pricing)).toBe(1.36);
  });

  it("keeps an exact custom snapshot card flat at long-context sizes", () => {
    const pricing = { ...defaultPricing, "gpt-6.1-terra-2026-10-26": { inputPerMillion: 0.5, outputPerMillion: 2 } };
    expect(calculateRequestCostsUsd([request("gpt-6.1-terra-2026-10-26", 300_000)], pricing)).toBe(0.17);
  });

  it("bills legacy generic cache-write rates for unclassified OpenAI TTL writes", () => {
    const pricing = { "custom-model": { inputPerMillion: 1, cacheCreationInputPerMillion: 2, outputPerMillion: 4 } };
    const result = calculateRequestCosts([{ model: "custom-model", inputTokens: 10_000, cachedInputTokens: 0, cacheCreationInputTokens30m: 2_000, cacheCreationInputTokens12h: 1_000, outputTokens: 1_000, reasoningTokens: 0, requestInputTokens: 10_000 }], pricing);
    expect(result.costUsd).toBe(0.017);
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
