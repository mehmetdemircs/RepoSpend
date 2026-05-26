import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { groupByDay, groupByHour, groupByModel, groupByRepo, groupBySourceApp } from "./aggregate.js";
import { calculateCostUsd, defaultPricing } from "./pricing.js";
import { findGitRoot, resolveRepoInfo } from "./repo.js";
import { isCopilotAliasModel, resolvePricingForModel, versionedFallbackModel, type NormalizedUsage } from "@repospend/types";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("repo normalization", () => {
  it("walks upward to find a Git root", () => {
    const root = makeRepo();
    const nested = path.join(root, "apps", "web");
    fs.mkdirSync(nested, { recursive: true });

    expect(findGitRoot(nested)).toBe(root);
  });

  it("merges nested cwd paths into one repo group", () => {
    const root = makeRepo();
    const nested = path.join(root, "apps", "web");
    fs.mkdirSync(nested, { recursive: true });

    const sessions = [
      usage({ id: "a", cwd: root, repoRoot: resolveRepoInfo(root).repoRoot, repoName: "RepoA", totalTokens: 100 }),
      usage({ id: "b", cwd: nested, repoRoot: resolveRepoInfo(nested).repoRoot, repoName: "RepoA", totalTokens: 200 }),
    ];

    const repos = groupByRepo(sessions);
    expect(repos).toHaveLength(1);
    expect(repos[0]?.totalTokens).toBe(300);
    expect(repos[0]?.sessionCount).toBe(2);
  });

  it("merges configured repo aliases by path", () => {
    const root = makeRepo("afterax-random-checkout");
    const info = resolveRepoInfo(root, { repos: [{ name: "RivendellRecords", paths: [root] }] });

    expect(info.repoName).toBe("RivendellRecords");
  });
});

describe("pricing and grouping", () => {
  it("calculates cost with cached and reasoning token rates", () => {
    const cost = calculateCostUsd(
      {
        model: "known",
        inputTokens: 1_000_000,
        cachedInputTokens: 100_000,
        outputTokens: 200_000,
        reasoningTokens: 50_000,
      },
      {
        known: {
          inputPerMillion: 1,
          cachedInputPerMillion: 0.1,
          outputPerMillion: 5,
          reasoningOutputPerMillion: 10,
        },
      },
    );

    expect(cost).toBe(2.41);
  });

  it("leaves unknown model cost undefined", () => {
    expect(calculateCostUsd(usage({ model: "mystery" }), {})).toBeUndefined();
  });

  it("uses Claude family pricing for dated model ids when exact pricing is empty", () => {
    const cost = calculateCostUsd(
      {
        model: "claude-haiku-4-5-20251001",
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        outputTokens: 100_000,
        reasoningTokens: 0,
      },
      {
        "claude-haiku-4-5": { inputPerMillion: 1, cachedInputPerMillion: 0.1, outputPerMillion: 5 },
        "claude-haiku-4-5-20251001": { inputPerMillion: 0, cachedInputPerMillion: 0, outputPerMillion: 0 },
      },
    );

    expect(cost).toBe(1.5);
  });

  it("does not inherit regular Opus pricing for Copilot fast mode without public token rates", () => {
    expect(
      calculateCostUsd(
        {
          model: "claude-opus-4-6-fast-mode",
          inputTokens: 1_000_000,
          cachedInputTokens: 0,
          outputTokens: 100_000,
          reasoningTokens: 0,
        },
        {
          "claude-opus-4-6": { inputPerMillion: 5, cachedInputPerMillion: 0.5, outputPerMillion: 25 },
          "claude-opus-4-6-fast-mode": { inputPerMillion: 0, cachedInputPerMillion: 0, outputPerMillion: 0 },
        },
      ),
    ).toBeUndefined();
  });

  it("keeps unrelated Opus 4.6 fast-suffixed variants priceable through family pricing", () => {
    expect(
      calculateCostUsd(
        {
          model: "claude-opus-4-6-fast-eval",
          inputTokens: 1_000_000,
          cachedInputTokens: 0,
          outputTokens: 100_000,
          reasoningTokens: 0,
        },
        {
          "claude-opus-4-6": { inputPerMillion: 5, cachedInputPerMillion: 0.5, outputPerMillion: 25 },
        },
      ),
    ).toBe(7.5);
  });

  it("normalizes dotted Claude model aliases before family pricing", () => {
    expect(
      calculateCostUsd(
        {
          model: "claude-sonnet-4.6",
          inputTokens: 1_000_000,
          cachedInputTokens: 0,
          outputTokens: 100_000,
          reasoningTokens: 0,
        },
        {
          "claude-sonnet-4-6": { inputPerMillion: 3, cachedInputPerMillion: 0.3, outputPerMillion: 15 },
        },
      ),
    ).toBe(4.5);
  });

  it("does not classify GPT-4.1 aliases as GitHub-tuned Copilot models", () => {
    expect(isCopilotAliasModel("gpt-4.1")).toBe(false);
    expect(isCopilotAliasModel("gpt-41")).toBe(false);
    expect(
      calculateCostUsd(
        {
          model: "gpt-41",
          inputTokens: 1_000_000,
          cachedInputTokens: 0,
          outputTokens: 100_000,
          reasoningTokens: 0,
        },
        {
          "gpt-4.1": { inputPerMillion: 2, cachedInputPerMillion: 0.5, outputPerMillion: 8 },
        },
      ),
    ).toBe(2.8);
  });

  it("treats input tokens as total input when cache write and cache read tokens are split out", () => {
    const cost = calculateCostUsd(
      {
        model: "claude-sonnet-4-5",
        inputTokens: 1_300_000,
        cachedInputTokens: 200_000,
        cacheCreationInputTokens: 100_000,
        outputTokens: 300_000,
        reasoningTokens: 0,
      },
      {
        "claude-sonnet-4-5": {
          inputPerMillion: 3,
          cacheCreationInputPerMillion: 3.75,
          cachedInputPerMillion: 0.3,
          outputPerMillion: 15,
        },
      },
    );

    expect(cost).toBe(7.935);
  });

  it("prices Claude Opus 4.8 from its own bundled rate card", () => {
    const opusUsage = { model: "claude-opus-4-8", inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 100_000, reasoningTokens: 0 };
    // $5/M input + $25/M output: 1 * 5 + 0.1 * 25 = 7.5 (not the old $15/$75 Opus 4 fallback).
    expect(calculateCostUsd(opusUsage, defaultPricing)).toBe(7.5);
  });

  it("inherits the nearest older known version for unknown newer models", () => {
    const usageFor = (model: string) => ({ model, inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 100_000, reasoningTokens: 0 });
    // Unknown Opus 4.9 / Opus 5 fall back to Opus 4.8 ($5/$25 => 7.5), not the pricier Opus 4 base.
    expect(calculateCostUsd(usageFor("claude-opus-4-9"), defaultPricing)).toBe(7.5);
    expect(calculateCostUsd(usageFor("claude-opus-5"), defaultPricing)).toBe(7.5);
    // Unknown GPT 5.6 falls back to GPT 5.5 ($5 input / $30 output => 8).
    expect(calculateCostUsd(usageFor("gpt-5.6"), defaultPricing)).toBe(8);
  });

  it("reports the inherited source model so the UI can label it", () => {
    expect(resolvePricingForModel("claude-opus-4-9", defaultPricing)).toMatchObject({ sourceModel: "claude-opus-4-8", inherited: true });
    expect(resolvePricingForModel("gpt-5.6", defaultPricing)).toMatchObject({ sourceModel: "gpt-5.5", inherited: true });
  });

  it("only inherits within the same tier and never from a newer version", () => {
    // gpt-5.6-mini inherits gpt-5.4-mini, not the base gpt-5.5 line.
    expect(versionedFallbackModel("gpt-5.6-mini", Object.keys(defaultPricing))).toBe("gpt-5.4-mini");
    // A dot-less alias must not parse as version 41 and grab the newest GPT.
    expect(calculateCostUsd({ model: "gpt-41", inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 100_000, reasoningTokens: 0 }, defaultPricing)).toBe(2.8);
  });

  it("groups by day, hour, and model", () => {
    const sessions = [
      usage({ id: "a", startedAt: "2026-05-18T10:15:00.000Z", model: "gpt-5", totalTokens: 100 }),
      usage({ id: "b", startedAt: "2026-05-18T10:45:00.000Z", model: "gpt-5", totalTokens: 200 }),
      usage({ id: "c", startedAt: "2026-05-19T11:00:00.000Z", model: "gpt-5-mini", totalTokens: 300 }),
    ];

    expect(groupByDay(sessions)).toHaveLength(2);
    expect(groupByHour(sessions).find((group) => group.id.startsWith("2026-05-18T10"))?.totalTokens).toBe(300);
    expect(groupByModel(sessions).map((group) => group.id).sort()).toEqual(["gpt-5", "gpt-5-mini"]);
  });

  it("labels synthetic-only Claude unknown model groups", () => {
    const sessions = [
      usage({ id: "synthetic", sourceClient: "claude", model: undefined, totalTokens: 0, warnings: ["claude_synthetic_zero_usage", "missing_token_breakdown"] }),
    ];

    expect(groupByModel(sessions).find((group) => group.id === "unknown-model")?.label).toBe("Claude synthetic / no usage");
  });

  it("groups by source app", () => {
    const sessions = [
      usage({ id: "a", sourceApp: "VS Code", totalTokens: 100 }),
      usage({ id: "b", sourceApp: "Terminal", totalTokens: 200 }),
      usage({ id: "c", sourceApp: "VS Code", totalTokens: 300 }),
    ];

    const apps = groupBySourceApp(sessions);

    expect(apps.find((app) => app.id === "VS Code")?.totalTokens).toBe(400);
    expect(apps.find((app) => app.id === "Terminal")?.sessionCount).toBe(1);
  });

  it("tracks known and unknown cost sessions in groups", () => {
    const sessions = [
      usage({ id: "known", sourceApp: "Cursor", estimatedCostUsd: 0.25, totalTokens: 100 }),
      usage({ id: "unknown", sourceApp: "Cursor", estimatedCostUsd: undefined, totalTokens: 0, warnings: ["missing_token_breakdown", "unknown_cost"] }),
    ];

    const cursor = groupBySourceApp(sessions).find((group) => group.id === "Cursor");

    expect(cursor?.estimatedCostUsd).toBe(0.25);
    expect(cursor?.knownCostSessions).toBe(1);
    expect(cursor?.unknownCostSessions).toBe(1);
    expect(cursor?.warnings).toContain("unknown_cost");
  });
});

function makeRepo(name = "repo"): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });
  fs.writeFileSync(path.join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
  fs.writeFileSync(path.join(root, ".git", "config"), '[remote "origin"]\n\turl = git@example.com:org/repo.git\n');
  tempDirs.push(root);
  return root;
}

function usage(overrides: Partial<NormalizedUsage> = {}): NormalizedUsage {
  return {
    id: "id",
    sourceClient: "codex",
    sourceApp: "VS Code",
    sourceAppRaw: "vscode",
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
    tokenConfidence: "medium",
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
    ...overrides,
  };
}
