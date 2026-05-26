import { describe, expect, it } from "vitest";
import { parseCliDashboardOptions, parseCliDateFilters, parseCliFilters, valueAfter } from "./cli-options.js";

describe("CLI options", () => {
  it("parses dashboard filters used by summaries and exports", () => {
    expect(parseCliFilters([
      "--source",
      "codex,claude",
      "--source-app=VS Code",
      "--repo",
      "RepoSpend",
      "--model",
      "gpt-5-codex",
      "--from",
      "2026-05-01",
      "--to",
      "2026-05-29",
    ])).toEqual({
      source: ["codex", "claude"],
      sourceApp: ["VS Code"],
      repo: ["RepoSpend"],
      model: ["gpt-5-codex"],
      from: "2026-05-01",
      to: "2026-05-29",
    });
  });

  it("treats source all as no source filter", () => {
    expect(parseCliFilters(["--source", "all"])).toEqual({});
  });

  it("keeps warm-cache date parsing separate from source filters", () => {
    expect(parseCliDateFilters(["--source", "codex", "--from", "2026-05-01"])).toEqual({ from: "2026-05-01" });
    expect(parseCliDashboardOptions(["--split-source-apps"])).toEqual({ splitSourceApps: true });
    expect(valueAfter(["--format", "csv"], "--format")).toBe("csv");
  });
});
