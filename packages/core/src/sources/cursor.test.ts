import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { scanCursor } from "./cursor.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Cursor adapter", () => {
  it("handles a missing Cursor directory gracefully", () => {
    const cursorHome = makeTempDir();
    fs.rmSync(cursorHome, { recursive: true, force: true });

    const result = scanCursor({ cursorHome, pricing: {} });

    expect(result.sessions).toEqual([]);
    expect(result.source.available).toBe(false);
    expect(result.source.warnings.some((warning) => warning.includes("Cursor home directory not found"))).toBe(true);
  });

  it("parses Cursor JSONL transcripts with varied message, usage, and tool shapes", () => {
    const cursorHome = makeTempDir();
    const repo = makeTempDir();
    fs.mkdirSync(path.join(repo, ".git"));
    const transcriptDir = path.join(cursorHome, "projects", "-tmp-cursor-repo", "agent-transcripts", "session-a");
    fs.mkdirSync(transcriptDir, { recursive: true });
    const transcriptPath = path.join(transcriptDir, "session-a.jsonl");
    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({ type: "user_message", sessionId: "session-a", timestamp: "2026-05-18T10:00:00.000Z", cwd: repo, text: "synthetic Cursor prompt" }),
        "{not valid json",
        JSON.stringify({ type: "assistant_message", sessionId: "session-a", timestamp: "2026-05-18T10:00:02.000Z", model: "gpt-5.1-codex", message: "synthetic Cursor reply", usage: { input_tokens: 1000, cached_input_tokens: 200, output_tokens: 300, reasoning_tokens: 50 } }),
        JSON.stringify({ type: "tool_call", name: "terminal_command", status: "ok" }),
        JSON.stringify({ type: "tool_call", name: "edit_file", status: "ok" }),
      ].join("\n"),
    );

    const result = scanCursor({ cursorHome, pricing: { "gpt-5.1-codex": { inputPerMillion: 1, cachedInputPerMillion: 0.1, outputPerMillion: 10, reasoningOutputPerMillion: 10 } } });

    expect(result.sessions).toHaveLength(1);
    const session = result.sessions[0];
    expect(session?.sourceClient).toBe("cursor");
    expect(session?.sourceApp).toBe("Cursor CLI");
    expect(session?.detectedSurface).toBe("terminal_cli");
    expect(session?.repoRoot).toBe(repo);
    expect(session?.model).toBe("gpt-5.1-codex");
    expect(session?.inputTokens).toBe(1000);
    expect(session?.cachedInputTokens).toBe(200);
    expect(session?.outputTokens).toBe(300);
    expect(session?.reasoningTokens).toBe(50);
    expect(session?.totalTokens).toBe(1350);
    expect(session?.estimatedCostUsd).toBe(0.00432);
    expect(session?.parseStatus).toBe("partial");
    expect(session?.parseErrors?.[0]).toContain("jsonl_line_2");
    expect(session?.toolCallCount).toBe(2);
    expect(session?.shellCommandCount).toBe(1);
    expect(session?.fileEditCount).toBe(1);
    expect(session?.promptTimeline).toEqual([
      { role: "user", text: "synthetic Cursor prompt", timestamp: "2026-05-18T10:00:00.000Z" },
      { role: "assistant", text: "synthetic Cursor reply", timestamp: "2026-05-18T10:00:02.000Z" },
    ]);
    expect(session?.sourceMetadata?.cursor).toMatchObject({ surface: "cli" });
  });

  it("keeps Cursor sessions visible when token usage is missing", () => {
    const cursorHome = makeTempDir();
    const transcriptDir = path.join(cursorHome, "chats");
    fs.mkdirSync(transcriptDir, { recursive: true });
    fs.writeFileSync(
      path.join(transcriptDir, "missing-usage.jsonl"),
      [
        JSON.stringify({ role: "user", session_id: "missing-usage", timestamp: "2026-05-18T10:00:00.000Z", content: "prompt without usage" }),
        JSON.stringify({ role: "assistant", session_id: "missing-usage", timestamp: "2026-05-18T10:00:01.000Z", content: "reply without usage", modelName: "claude-sonnet-4-5" }),
      ].join("\n"),
    );

    const result = scanCursor({ cursorHome, pricing: {} });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.totalTokens).toBe(0);
    expect(result.sessions[0]?.estimatedCostUsd).toBeUndefined();
    expect(result.sessions[0]?.warnings).toContain("missing_token_breakdown");
    expect(result.sessions[0]?.model).toBe("claude-sonnet-4-5");
  });

  it("infers Cursor CLI transcript dates and repos from encoded project paths when records omit metadata", () => {
    const cursorHome = makeTempDir();
    const repo = fs.mkdtempSync(path.join("/tmp", "repospend-cursor-real-repo-"));
    tempDirs.push(repo);
    fs.mkdirSync(path.join(repo, ".git"));
    const encodedRepo = `-${repo.split(path.sep).filter(Boolean).join("-")}`;
    const transcriptDir = path.join(cursorHome, "projects", encodedRepo, "agent-transcripts", "1773480777812");
    fs.mkdirSync(transcriptDir, { recursive: true });
    fs.writeFileSync(
      path.join(transcriptDir, "no-metadata.jsonl"),
      [
        JSON.stringify({ role: "user", content: "prompt without timestamp or cwd" }),
        JSON.stringify({ role: "assistant", content: "reply without timestamp or cwd" }),
      ].join("\n"),
    );

    const result = scanCursor({ cursorHome, pricing: {} });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.repoRoot).toBe(repo);
    expect(result.sessions[0]?.startedAt).toBe("2026-03-14T09:32:57.812Z");
    expect(result.sessions[0]?.endedAt).toBe("2026-03-14T09:32:57.812Z");
    expect(result.sessions[0]?.warnings).toContain("missing_token_breakdown");
  });

  it("uses timestamped Cursor transcript paths for scan window upper bounds", () => {
    const cursorHome = makeTempDir();
    const projectId = "-tmp-repospend-cursor-window";
    const insideDir = path.join(cursorHome, "projects", projectId, "agent-transcripts", "1773480777812");
    const afterDir = path.join(cursorHome, "projects", projectId, "agent-transcripts", "1774080000000");
    fs.mkdirSync(insideDir, { recursive: true });
    fs.mkdirSync(afterDir, { recursive: true });
    fs.writeFileSync(path.join(insideDir, "inside.jsonl"), JSON.stringify({ role: "user", content: "inside" }));
    fs.writeFileSync(path.join(afterDir, "after.jsonl"), JSON.stringify({ role: "user", content: "after" }));

    const result = scanCursor({ cursorHome, pricing: {}, scanWindow: { toMs: Date.parse("2026-03-15T23:59:59.999Z") } });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.startedAt).toBe("2026-03-14T09:32:57.812Z");
  });

  it("extracts best-effort sessions from Cursor SQLite/vscdb key-value content", () => {
    const cursorHome = makeTempDir();
    const dbPath = path.join(cursorHome, "state.vscdb");
    const db = new Database(dbPath);
    db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)");
    db.prepare("INSERT INTO ItemTable VALUES (?, ?)").run(
      "cursor.composerData",
      JSON.stringify([
        { role: "user", conversationId: "sqlite-session", timestamp: "2026-05-18T10:00:00.000Z", text: "sqlite prompt", workspacePath: "/tmp/sqlite-workspace" },
        { role: "assistant", conversationId: "sqlite-session", timestamp: "2026-05-18T10:00:03.000Z", text: "sqlite reply", model: "claude-haiku-4-5", usage: { inputTokens: 120, outputTokens: 30 } },
      ]),
    );
    db.close();

    const result = scanCursor({ cursorHome, pricing: { "claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5 } } });

    expect(result.stats.databaseFileCount).toBe(1);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.id).toBe("sqlite-session");
    expect(result.sessions[0]?.sourceApp).toBe("Cursor Desktop");
    expect(result.sessions[0]?.inputTokens).toBe(120);
    expect(result.sessions[0]?.outputTokens).toBe(30);
    expect(result.sessions[0]?.estimatedCostUsd).toBe(0.00027);
    expect(result.sessions[0]?.sourceMetadata?.cursor).toMatchObject({ surface: "desktop" });
  });

  it("only scans Cursor-owned application storage databases by default", () => {
    const previousHome = process.env.HOME;
    const previousAppData = process.env.APPDATA;
    const previousXdgConfigHome = process.env.XDG_CONFIG_HOME;
    const home = makeTempDir();
    process.env.HOME = home;
    process.env.APPDATA = path.join(home, "AppData", "Roaming");
    process.env.XDG_CONFIG_HOME = path.join(home, ".config");
    try {
      const globalStorage = testCursorGlobalStoragePath(home);
      const cursorStorage = path.join(globalStorage, "cursor.chat");
      const extensionStorage = path.join(globalStorage, "ms-python.python");
      fs.mkdirSync(cursorStorage, { recursive: true });
      fs.mkdirSync(extensionStorage, { recursive: true });

      writeCursorDb(path.join(cursorStorage, "state.vscdb"), "cursor.composerData", {
        composerId: "owned-session",
        role: "assistant",
        timestamp: "2026-05-18T10:00:00.000Z",
        model: "gpt-5.1-codex",
        usage: { inputTokens: 100, outputTokens: 20 },
      });
      writeCursorDb(path.join(extensionStorage, "extension.vscdb"), "cursor.composerData", {
        composerId: "foreign-extension-session",
        role: "assistant",
        timestamp: "2026-05-18T10:00:00.000Z",
        model: "gpt-5.1-codex",
        usage: { inputTokens: 100, outputTokens: 20 },
      });

      const result = scanCursor({ pricing: { "gpt-5.1-codex": { inputPerMillion: 1, outputPerMillion: 10 } } });

      expect(result.stats.databaseFileCount).toBe(1);
      expect(result.sessions.map((session) => session.id)).toEqual(["owned-session"]);
      expect(result.sessions.some((session) => session.sourcePath.includes("ms-python.python"))).toBe(false);
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousAppData === undefined) delete process.env.APPDATA;
      else process.env.APPDATA = previousAppData;
      if (previousXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = previousXdgConfigHome;
    }
  });

  it("imports Cursor prompt token breakdowns as low-confidence estimates", () => {
    const cursorHome = makeTempDir();
    const dbPath = path.join(cursorHome, "state.vscdb");
    const db = new Database(dbPath);
    db.exec("CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT)");
    db.prepare("INSERT INTO cursorDiskKV VALUES (?, ?)").run(
      "composerData:estimated-session",
      JSON.stringify({
        composerId: "estimated-session",
        name: "Estimated Cursor session",
        createdAt: 1_779_099_600_000,
        modelConfig: { modelName: "default" },
        promptTokenBreakdown: { totalUsedTokens: 21_039, maxTokens: 200_000 },
      }),
    );
    db.close();

    const result = scanCursor({ cursorHome, pricing: {} });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.id).toBe("estimated-session");
    expect(result.sessions[0]?.inputTokens).toBe(21_039);
    expect(result.sessions[0]?.totalTokens).toBe(21_039);
    expect(result.sessions[0]?.startedAt).toBe("2026-05-18T10:20:00.000Z");
    expect(result.sessions[0]?.tokenAggregationMethod).toBe("estimated");
    expect(result.sessions[0]?.tokenConfidence).toBe("low");
    expect(result.sessions[0]?.warnings).toContain("cursor_prompt_token_breakdown_estimate");
    expect(result.sessions[0]?.warnings).toContain("cursor_cost_not_estimated_from_prompt_tokens");
  });

  it("ignores Cursor SQLite metadata rows without messages or token signals", () => {
    const cursorHome = makeTempDir();
    const dbPath = path.join(cursorHome, "state.vscdb");
    const db = new Database(dbPath);
    db.exec("CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT)");
    db.prepare("INSERT INTO cursorDiskKV VALUES (?, ?)").run(
      "composerData:metadata-only",
      JSON.stringify({
        composerId: "metadata-only",
        name: "Metadata-only Cursor entry",
        workspacePath: "/tmp/cursor-workspace",
        modelConfig: { modelName: "default" },
      }),
    );
    db.close();

    const result = scanCursor({ cursorHome, pricing: {} });

    expect(result.sessions).toEqual([]);
  });

  it("merges duplicate Cursor session ids from JSONL and SQLite sources without double-counting", () => {
    const cursorHome = makeTempDir();
    const transcriptDir = path.join(cursorHome, "chats");
    fs.mkdirSync(transcriptDir, { recursive: true });
    fs.writeFileSync(
      path.join(transcriptDir, "duplicate-session.jsonl"),
      [
        JSON.stringify({ role: "user", sessionId: "duplicate-session", timestamp: "2026-05-18T10:00:00.000Z", content: "prompt without usage" }),
        JSON.stringify({ role: "assistant", sessionId: "duplicate-session", timestamp: "2026-05-18T10:00:01.000Z", content: "reply without usage", model: "gpt-5.1-codex" }),
      ].join("\n"),
    );
    const dbPath = path.join(cursorHome, "state.vscdb");
    const db = new Database(dbPath);
    db.exec("CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT)");
    db.prepare("INSERT INTO cursorDiskKV VALUES (?, ?)").run(
      "composerData:duplicate-session",
      JSON.stringify({
        composerId: "duplicate-session",
        name: "Duplicate Cursor session",
        createdAt: "2026-05-18T10:00:00.000Z",
        model: "gpt-5.1-codex",
        usage: { inputTokens: 1_000, outputTokens: 200 },
      }),
    );
    db.close();

    const result = scanCursor({ cursorHome, pricing: { "gpt-5.1-codex": { inputPerMillion: 1, outputPerMillion: 10 } } });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.id).toBe("duplicate-session");
    expect(result.sessions[0]?.inputTokens).toBe(1_000);
    expect(result.sessions[0]?.outputTokens).toBe(200);
    expect(result.sessions[0]?.totalTokens).toBe(1_200);
    expect(result.sessions[0]?.estimatedCostUsd).toBe(0.003);
    expect(result.sessions[0]?.warnings).toContain("cursor_duplicate_session_merged");
    expect(result.sessions[0]?.warnings).not.toContain("missing_token_breakdown");
  });
});

function writeCursorDb(dbPath: string, key: string, value: unknown): void {
  const db = new Database(dbPath);
  db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)");
  db.prepare("INSERT INTO ItemTable VALUES (?, ?)").run(key, JSON.stringify(value));
  db.close();
}

function testCursorGlobalStoragePath(home: string): string {
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "Cursor", "User", "globalStorage");
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "Cursor", "User", "globalStorage");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "Cursor", "User", "globalStorage");
}

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repospend-cursor-"));
  tempDirs.push(dir);
  return dir;
}
