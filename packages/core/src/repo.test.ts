import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { groupByDay, groupByHour, groupByModel, groupByRepo, groupBySourceApp } from "./aggregate.js";
import { calculateCostUsd } from "./pricing.js";
import { findGitRoot, resolveRepoInfo } from "./repo.js";
import type { NormalizedUsage } from "@repospend/types";

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
