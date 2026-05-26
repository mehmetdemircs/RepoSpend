import { describe, expect, it } from "vitest";
import { buildUrlSearch, parsePathView } from "./url-state";

describe("URL state", () => {
  it("serializes dashboard filters and custom dates into shareable query params", () => {
    const search = buildUrlSearch({
      filters: {
        source: ["codex", "claude"],
        sourceApp: ["VS Code"],
        repo: ["/tmp/repo"],
        model: ["gpt-5-codex"],
        from: "2026-05-01",
        to: "2026-05-29",
      },
      rangePreset: "custom",
      metric: "estimatedCostUsd",
    });
    const params = new URLSearchParams(search.slice(1));

    expect(params.get("source")).toBe("codex,claude");
    expect(params.get("sourceApp")).toBe("VS Code");
    expect(params.get("repo")).toBe("/tmp/repo");
    expect(params.get("model")).toBe("gpt-5-codex");
    expect(params.get("range")).toBe("custom");
    expect(params.get("from")).toBe("2026-05-01");
    expect(params.get("to")).toBe("2026-05-29");
    expect(params.get("metric")).toBe("estimatedCostUsd");
  });

  it("supports the old commands route as an Agent Friction alias", () => {
    expect(parsePathView(["agent-friction"])).toBe("commands");
    expect(parsePathView(["commands"])).toBe("commands");
  });
});
