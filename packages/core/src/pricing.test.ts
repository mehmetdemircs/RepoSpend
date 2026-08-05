import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultPricing, loadPricingTable, pricingOverrides, savePricingTable } from "./pricing.js";

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
    const legacyFullTable = {
      ...defaultPricing,
      "gpt-5.6-terra": { inputPerMillion: 2.5, cachedInputPerMillion: 0.25, cacheCreationInputPerMillion: 3.125, outputPerMillion: 15, reasoningOutputPerMillion: 15 },
      "gpt-5.6-luna": { inputPerMillion: 1, cachedInputPerMillion: 0.1, cacheCreationInputPerMillion: 1.25, outputPerMillion: 6, reasoningOutputPerMillion: 6 },
    };
    fs.writeFileSync(pricingPath, `${JSON.stringify(legacyFullTable)}\n`);

    const loaded = loadPricingTable(pricingPath);

    expect(loaded["gpt-5.6-terra"]).toEqual(defaultPricing["gpt-5.6-terra"]);
    expect(loaded["gpt-5.6-luna"]).toEqual(defaultPricing["gpt-5.6-luna"]);
    expect(loaded["claude-sonnet-5"]).toEqual(defaultPricing["claude-sonnet-5"]);
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
