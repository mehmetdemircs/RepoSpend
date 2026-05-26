import { describe, expect, it } from "vitest";
import { parseDashboardOptions, parseFilters } from "./data.js";

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
