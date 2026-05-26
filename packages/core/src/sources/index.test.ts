import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanUsageSources } from "./index.js";

const tempDirs: string[] = [];
let previousRepoSpendHome: string | undefined;

beforeEach(() => {
  previousRepoSpendHome = process.env.REPOSPEND_HOME;
  process.env.REPOSPEND_HOME = makeTempDir();
});

afterEach(() => {
  if (previousRepoSpendHome === undefined) delete process.env.REPOSPEND_HOME;
  else process.env.REPOSPEND_HOME = previousRepoSpendHome;
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("usage source scanning", () => {
  it("does not scan experimental Cursor data unless it is enabled", () => {
    const codexHome = makeTempDir();
    const claudeHome = makeTempDir();
    const copilotHome = makeTempDir();

    const result = scanUsageSources({ codexHome, claudeHome, copilotHome, config: {}, pricing: {} });

    expect(result.sources.map((source) => source.id)).toEqual(["codex", "claude", "copilot"]);
    expect(result.sourceStats.map((source) => source.sourceId)).toEqual(["codex", "claude", "copilot"]);
    expect(result.sessions.some((session) => session.sourceClient === "cursor")).toBe(false);
  });
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repospend-sources-"));
  tempDirs.push(dir);
  return dir;
}
