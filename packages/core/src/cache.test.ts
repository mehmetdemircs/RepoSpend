import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearRepoSpendCache, parseCacheRoot, readJsonCache, writeJsonCache } from "./cache.js";

const previousRepoSpendHome = process.env.REPOSPEND_HOME;

describe("parse cache", () => {
  beforeEach(() => {
    process.env.REPOSPEND_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "repospend-cache-"));
  });

  afterEach(() => {
    if (process.env.REPOSPEND_HOME) fs.rmSync(process.env.REPOSPEND_HOME, { recursive: true, force: true });
    if (previousRepoSpendHome === undefined) delete process.env.REPOSPEND_HOME;
    else process.env.REPOSPEND_HOME = previousRepoSpendHome;
  });

  it("reads cached JSON entries by namespace and key", () => {
    writeJsonCache("codex-session", { file: "one.jsonl", mtimeMs: 1 }, { totalTokens: 42 });

    expect(readJsonCache<{ totalTokens: number }>("codex-session", { file: "one.jsonl", mtimeMs: 1 })).toEqual({ totalTokens: 42 });
    expect(readJsonCache("codex-session", { file: "one.jsonl", mtimeMs: 2 })).toBeUndefined();
  });

  it("clears stale cache-version directories when preparing the active cache", () => {
    const oldCacheRoot = path.join(process.env.REPOSPEND_HOME ?? "", "cache", "old-version");
    fs.mkdirSync(oldCacheRoot, { recursive: true });
    fs.writeFileSync(path.join(oldCacheRoot, "entry.json"), "{}\n");

    writeJsonCache("codex-session", { file: "two.jsonl", mtimeMs: 1 }, { totalTokens: 100 });

    expect(fs.existsSync(oldCacheRoot)).toBe(false);
    expect(fs.existsSync(parseCacheRoot())).toBe(true);
  });

  it("removes the full RepoSpend cache directory on demand", () => {
    writeJsonCache("codex-session", { file: "three.jsonl", mtimeMs: 1 }, { totalTokens: 7 });

    const result = clearRepoSpendCache();

    expect(result.removed).toBe(true);
    expect(fs.existsSync(result.path)).toBe(false);
  });
});
