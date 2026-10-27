import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseDashboardOptions, parseFilters, readPricingData } from "./data.js";

describe("API dashboard query parsing", () => {
  it("parses multi-value dashboard filters for API exports and dashboard reads", () => {
    expect(parseFilters({
      source: "codex,claude",
      sourceApp: ["VS Code", "Terminal,Codex"],
      repo: "/tmp/repo",
      model: "gpt-5,unknown-model",
      from: "2026-05-01",
      to: "2026-05-29",
    })).toEqual({
      source: ["codex", "claude"],
      sourceApp: ["VS Code", "Terminal", "Codex"],
      repo: ["/tmp/repo"],
      model: ["gpt-5", "unknown-model"],
      from: "2026-05-01",
      to: "2026-05-29",
    });
  });

  it("parses split source app display mode", () => {
    expect(parseDashboardOptions({ splitSourceApps: "true" })).toEqual({ splitSourceApps: true });
    expect(parseDashboardOptions({ splitSourceApps: "0" })).toEqual({ splitSourceApps: false });
  });
});

describe("pricing response metadata", () => {
  it("ships the engine base-to-long-context mapping, including the gpt-5.6 alias", () => {
    const previous = process.env.REPOSPEND_HOME;
    process.env.REPOSPEND_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "repospend-data-"));
    try {
      const { contextRules, defaults } = readPricingData();
      const solRule = contextRules.find((rule) => rule.baseModel === "gpt-5.6");
      expect(solRule).toEqual({ baseModel: "gpt-5.6", longContextModel: "gpt-5.6-sol-long-context", thresholdInputTokens: 272_000 });
      expect(contextRules.some((rule) => rule.longContextModel === "claude-haiku-5-5-long-context")).toBe(true);
      expect(defaults).toBeDefined();
    } finally {
      fs.rmSync(process.env.REPOSPEND_HOME, { recursive: true, force: true });
      if (previous === undefined) delete process.env.REPOSPEND_HOME;
      else process.env.REPOSPEND_HOME = previous;
    }
  });
});
