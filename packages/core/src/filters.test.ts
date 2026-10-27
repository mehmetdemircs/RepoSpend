import { describe, expect, it } from "vitest";
import type { NormalizedUsage } from "@repospend/types";
import { filterUsage } from "./filters.js";
import { toCsv } from "./aggregate.js";

describe("filterUsage model matching", () => {
  it("matches a session when the filtered model appears in any modelUsage slice", () => {
    const sessions = [
      usage({
        id: "mixed",
        model: "gpt-6-astra",
        modelUsage: [
          { model: "gpt-6-astra", requestCount: 1, inputTokens: 100, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 10, reasoningTokens: 0, totalTokens: 110, estimatedCostUsd: 1 },
          { model: "gpt-6-sol", requestCount: 1, inputTokens: 50, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 5, reasoningTokens: 0, totalTokens: 55, estimatedCostUsd: 0.5 },
        ],
      }),
      usage({ id: "solo", model: "claude-sonnet-5" }),
    ];

    expect(filterUsage(sessions, { model: "gpt-6-sol" }).map((session) => session.id)).toEqual(["mixed"]);
    expect(filterUsage(sessions, { model: "gpt-6-astra" }).map((session) => session.id)).toEqual(["mixed"]);
    expect(filterUsage(sessions, { model: "claude-sonnet-5" }).map((session) => session.id)).toEqual(["solo"]);
    expect(filterUsage(sessions, { model: "unknown-model" })).toEqual([]);
  });

  it("projects only the matching modelUsage slices into a filtered session", () => {
    const sessions = [
      usage({
        id: "mixed",
        model: "gpt-6-astra",
        inputTokens: 150,
        cachedInputTokens: 12,
        cacheCreationInputTokens: 4,
        cacheCreationInputTokens30m: 3,
        cacheCreationInputTokens12h: 1,
        outputTokens: 15,
        reasoningTokens: 2,
        totalTokens: 165,
        estimatedCostUsd: 1.5,
        messageCount: 7,
        modelUsage: [
          { model: "gpt-6-astra", requestCount: 1, inputTokens: 100, cachedInputTokens: 10, cacheCreationInputTokens: 4, cacheCreationInputTokens30m: 3, cacheCreationInputTokens12h: 1, outputTokens: 10, reasoningTokens: 2, totalTokens: 110, estimatedCostUsd: 1 },
          { model: "gpt-6-sol", requestCount: 1, inputTokens: 50, cachedInputTokens: 2, cacheCreationInputTokens: 0, outputTokens: 5, reasoningTokens: 0, totalTokens: 55, estimatedCostUsd: 0.5 },
        ],
      }),
    ];

    const projected = filterUsage(sessions, { model: "gpt-6-sol" })[0]!;
    expect(projected.id).toBe("mixed");
    expect(projected.modelUsage).toHaveLength(1);
    expect(projected.modelUsage?.[0]?.model).toBe("gpt-6-sol");
    expect(projected.inputTokens).toBe(50);
    expect(projected.cachedInputTokens).toBe(2);
    expect(projected.cacheCreationInputTokens).toBe(0);
    expect(projected.outputTokens).toBe(5);
    expect(projected.reasoningTokens).toBe(0);
    expect(projected.totalTokens).toBe(55);
    expect(projected.estimatedCostUsd).toBe(0.5);
    expect(projected.messageCount).toBe(7);
  });

  it("sums each matching slice once when several selected models appear in one session", () => {
    const sessions = [
      usage({
        id: "mixed",
        model: "gpt-6-astra",
        modelUsage: [
          { model: "gpt-6-astra", requestCount: 1, inputTokens: 100, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 10, reasoningTokens: 0, totalTokens: 110, estimatedCostUsd: 1 },
          { model: "gpt-6-sol", requestCount: 1, inputTokens: 50, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 5, reasoningTokens: 0, totalTokens: 55, estimatedCostUsd: 0.5 },
          { model: "gpt-6-luna", requestCount: 1, inputTokens: 25, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 2, reasoningTokens: 0, totalTokens: 27, estimatedCostUsd: 0.25 },
        ],
      }),
    ];

    const projected = filterUsage(sessions, { model: "gpt-6-astra,gpt-6-sol" })[0]!;
    expect(projected.id).toBe("mixed");
    expect(projected.modelUsage?.map((entry) => entry.model)).toEqual(["gpt-6-astra", "gpt-6-sol"]);
    expect(projected.inputTokens).toBe(150);
    expect(projected.totalTokens).toBe(165);
    expect(projected.estimatedCostUsd).toBe(1.5);
  });

  it("leaves sessions without modelUsage untouched and filters out unselected slices only", () => {
    const legacy = usage({ id: "legacy", model: "gpt-6-astra", inputTokens: 40, totalTokens: 44, estimatedCostUsd: 0.4 });
    const projected = filterUsage([legacy], { model: "gpt-6-astra" });
    expect(projected).toEqual([legacy]);
  });

  it("projects reasoningOutputTokens and labels the session with the selected model", () => {
    const sessions = [
      usage({
        id: "mixed",
        model: "gpt-6-astra",
        outputTokens: 15,
        reasoningTokens: 7,
        reasoningOutputTokens: 7,
        totalTokens: 165,
        estimatedCostUsd: 1.5,
        modelUsage: [
          { model: "gpt-6-astra", requestCount: 1, inputTokens: 100, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 10, reasoningTokens: 2, totalTokens: 110, estimatedCostUsd: 1 },
          { model: "gpt-6-sol", requestCount: 1, inputTokens: 50, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 5, reasoningTokens: 5, totalTokens: 55, estimatedCostUsd: 0.5 },
        ],
      }),
    ];

    const projected = filterUsage(sessions, { model: "gpt-6-sol" })[0]!;
    expect(projected.id).toBe("mixed");
    expect(projected.model).toBe("gpt-6-sol");
    expect(projected.reasoningTokens).toBe(5);
    expect(projected.reasoningOutputTokens).toBe(5);
    expect(projected.outputTokens).toBe(5);
    // JSON and CSV exports carry the same projected identity and totals.
    const exported = JSON.parse(JSON.stringify(projected));
    expect(exported.model).toBe("gpt-6-sol");
    expect(exported.modelUsage).toHaveLength(1);
    const csv = toCsv([projected]);
    expect(csv.split("\n")[1]).toContain("gpt-6-sol");
    expect(csv.split("\n")[1]).not.toContain("gpt-6-astra");
  });

  it("keeps a selected multi-model representative identity without double counting", () => {
    const sessions = [
      usage({
        id: "mixed",
        model: "gpt-6-astra",
        reasoningTokens: 7,
        reasoningOutputTokens: 7,
        modelUsage: [
          { model: "gpt-6-astra", requestCount: 1, inputTokens: 100, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 10, reasoningTokens: 2, totalTokens: 110, estimatedCostUsd: 1 },
          { model: "gpt-6-sol", requestCount: 1, inputTokens: 50, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 5, reasoningTokens: 5, totalTokens: 55, estimatedCostUsd: 0.5 },
          { model: "gpt-6-luna", requestCount: 1, inputTokens: 25, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 2, reasoningTokens: 1, totalTokens: 27, estimatedCostUsd: 0.25 },
        ],
      }),
    ];

    const projected = filterUsage(sessions, { model: "gpt-6-astra,gpt-6-sol" })[0]!;
    expect(projected.model).toBe("gpt-6-astra");
    expect(projected.reasoningTokens).toBe(7);
    expect(projected.reasoningOutputTokens).toBe(7);
    expect(projected.totalTokens).toBe(165);

    const solLuna = filterUsage(sessions, { model: "gpt-6-sol,gpt-6-luna" })[0]!;
    expect(solLuna.model).toBe("gpt-6-sol");
    expect(solLuna.reasoningTokens).toBe(6);
    expect(solLuna.totalTokens).toBe(82);
  });
});

function usage(overrides: Partial<NormalizedUsage>): NormalizedUsage {
  return {
    id: "id",
    sourceClient: "codex",
    sourceApp: "VS Code",
    sourceAppRaw: "vscode",
    sourcePath: "/tmp/source",
    repoRoot: "/tmp/repo",
    repoName: "repo",
    cwd: "/tmp/repo",
    startedAt: "2026-10-20T10:00:00.000Z",
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    warnings: [],
    ...overrides,
  } as NormalizedUsage;
}
