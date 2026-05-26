import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanCodex } from "./codex.js";

const tempDirs: string[] = [];
let previousRepoSpendHome: string | undefined;

beforeEach(() => {
  previousRepoSpendHome = process.env.REPOSPEND_HOME;
  process.env.REPOSPEND_HOME = makeTempDir();
});

afterEach(() => {
  if (previousRepoSpendHome === undefined) delete process.env.REPOSPEND_HOME;
  else process.env.REPOSPEND_HOME = previousRepoSpendHome;
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Codex adapter", () => {
  it("handles missing Codex files gracefully", () => {
    const codexHome = makeTempDir();
    const result = scanCodex({ codexHome, pricing: {} });

    expect(result.sessions).toEqual([]);
    expect(result.source.available).toBe(false);
    expect(result.source.warnings.some((warning) => warning.includes("state_5.sqlite"))).toBe(true);
    expect(result.source.warnings.some((warning) => warning.includes("sessions"))).toBe(true);
  });

  it("handles unreadable Codex sessions gracefully", () => {
    const codexHome = makeTempDir();
    const sessions = path.join(codexHome, "sessions");
    fs.writeFileSync(sessions, "not a directory");

    const result = scanCodex({ codexHome, pricing: {} });

    expect(result.sessions).toEqual([]);
    expect(result.source.warnings.some((warning) => warning.includes("Unable to read Codex sessions"))).toBe(true);
  });

  it("uses scan window upper bounds for Codex thread rows with known creation dates", () => {
    const codexHome = makeTempDir();
    const db = new Database(path.join(codexHome, "state_5.sqlite"));
    db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, created_at TEXT, updated_at TEXT, cwd TEXT, title TEXT, model_provider TEXT, model TEXT, tokens_used INTEGER)");
    db.prepare("INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("inside-window", "2026-05-14T10:00:00.000Z", "2026-05-14T10:05:00.000Z", codexHome, "Inside", "openai", "known-model", 100);
    db.prepare("INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("after-window", "2026-05-16T10:00:00.000Z", "2026-05-16T10:05:00.000Z", codexHome, "After", "openai", "known-model", 100);
    db.close();

    const result = scanCodex({ codexHome, pricing: {}, scanWindow: { toMs: Date.parse("2026-05-15T23:59:59.999Z") } });

    expect(result.sessions.map((session) => session.id)).toEqual(["inside-window"]);
  });

  it("extracts cumulative Codex token_count events and calculates cost", () => {
    const codexHome = makeTempDir();
    const repo = makeTempDir();
    fs.mkdirSync(path.join(repo, ".git"));
    const sessionsDir = path.join(codexHome, "sessions", "2026", "05", "18");
    fs.mkdirSync(sessionsDir, { recursive: true });
    const rolloutPath = path.join(sessionsDir, "rollout-test-session.jsonl");
    fs.writeFileSync(
      rolloutPath,
      [
        JSON.stringify({
          timestamp: "2026-05-18T10:00:00.000Z",
          type: "session_meta",
          payload: {
            source: "vscode",
            originator: "codex_vscode",
            thread_source: "user",
          },
        }),
        JSON.stringify({
          timestamp: "2026-05-18T10:00:00.000Z",
          type: "event_msg",
          payload: {
            type: "user_message",
            message: "hello",
          },
        }),
        JSON.stringify({
          timestamp: "2026-05-18T10:00:01.000Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "hello" }],
          },
        }),
        JSON.stringify({
          timestamp: "2026-05-18T10:00:02.000Z",
          type: "event_msg",
          payload: {
            type: "agent_message",
            message: "hi",
          },
        }),
        JSON.stringify({
          timestamp: "2026-05-18T10:00:03.000Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "hi" }],
          },
        }),
        JSON.stringify({
          timestamp: "2026-05-18T10:00:04.000Z",
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: {
                input_tokens: 500_000,
                cached_input_tokens: 100_000,
                output_tokens: 150_000,
                reasoning_output_tokens: 50_000,
                total_tokens: 650_000,
              },
            },
          },
        }),
        JSON.stringify({
          timestamp: "2026-05-18T10:01:00.000Z",
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: {
                input_tokens: 1_000_000,
                cached_input_tokens: 200_000,
                output_tokens: 300_000,
                reasoning_output_tokens: 100_000,
                total_tokens: 1_300_000,
              },
            },
          },
        }),
      ].join("\n"),
    );
    fs.writeFileSync(path.join(codexHome, "config.toml"), 'service_tier = "fast"\n');

    const db = new Database(path.join(codexHome, "state_5.sqlite"));
    db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, created_at INTEGER, updated_at INTEGER, cwd TEXT, title TEXT, model_provider TEXT, model TEXT, tokens_used INTEGER, source TEXT, thread_source TEXT)");
    db.prepare("INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("test-session", rolloutPath, 1_779_099_600, 1_779_099_660, repo, "Token test", "openai", "known-model", 1_300_000, "vscode", "user");
    db.close();

    const result = scanCodex({
      codexHome,
      pricing: {
        "known-model": {
          inputPerMillion: 1,
          cachedInputPerMillion: 0.1,
          outputPerMillion: 10,
          reasoningOutputPerMillion: 20,
        },
      },
    });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.inputTokens).toBe(1_000_000);
    expect(result.sessions[0]?.cachedInputTokens).toBe(200_000);
    expect(result.sessions[0]?.outputTokens).toBe(200_000);
    expect(result.sessions[0]?.reasoningTokens).toBe(100_000);
    expect(result.sessions[0]?.reasoningOutputTokens).toBe(100_000);
    expect(result.sessions[0]?.totalTokens).toBe(1_300_000);
    expect(result.sessions[0]?.tokenAggregationMethod).toBe("final_snapshot");
    expect(result.sessions[0]?.tokenConfidence).toBe("high");
    expect(result.sessions[0]?.tokenSnapshotCount).toBe(2);
    expect(result.sessions[0]?.estimatedCostUsd).toBe(4.82);
    expect(result.sessions[0]?.sourceApp).toBe("VS Code");
    expect(result.sessions[0]?.sourceAppRaw).toBe("vscode");
    expect(result.sessions[0]?.detectedSurface).toBe("vscode_extension");
    expect(result.sessions[0]?.surfaceConfidence).toBe("high");
    expect(result.sessions[0]?.messageCount).toBe(2);
    expect(result.sessions[0]?.userPromptCount).toBe(1);
    expect(result.sessions[0]?.assistantMessageCount).toBe(1);
    expect(result.sessions[0]?.promptTimeline).toEqual([
      { role: "user", text: "hello", timestamp: "2026-05-18T10:00:00.000Z" },
      { role: "assistant", text: "hi", timestamp: "2026-05-18T10:00:02.000Z" },
    ]);
    expect(result.sessions[0]?.rawEventCount).toBe(7);
    expect(result.sessions[0]?.parseStatus).toBe("ok");
    expect(result.sessions[0]?.sessionOutcome).toBe("research_only");
    expect(result.stats.sessionFileCount).toBe(1);
    expect(result.stats.sessionsImported).toBe(1);
    expect(result.stats.parseFailureCount).toBe(0);
    expect(result.stats.serviceTier).toBe("fast");
    expect(result.stats.serviceTierSource).toBe("current_config");
    expect(result.source.serviceTier).toBe("fast");
  });

  it("infers missing model metadata from imported Claude source sessions", () => {
    const codexHome = makeTempDir();
    const repo = makeTempDir();
    fs.mkdirSync(path.join(repo, ".git"));
    const sessionsDir = path.join(codexHome, "sessions", "2026", "05", "18");
    fs.mkdirSync(sessionsDir, { recursive: true });
    const rolloutPath = path.join(sessionsDir, "rollout-imported-claude.jsonl");
    fs.writeFileSync(
      rolloutPath,
      JSON.stringify({
        timestamp: "2026-05-18T10:00:04.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: { total_token_usage: { input_tokens: 1000, output_tokens: 100, total_tokens: 1100 } },
        },
      }),
    );
    const claudePath = path.join(makeTempDir(), "claude-source.jsonl");
    fs.writeFileSync(
      claudePath,
      [
        JSON.stringify({ type: "assistant", timestamp: "2026-05-18T10:00:00.000Z", message: { model: "claude-sonnet-4-6" } }),
        JSON.stringify({ type: "assistant", timestamp: "2026-05-18T10:00:01.000Z", message: { model: "claude-sonnet-4-6" } }),
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(codexHome, "external_agent_session_imports.json"),
      JSON.stringify({ records: [{ source_path: claudePath, imported_thread_id: "imported-claude", imported_at: 1_779_099_660 }] }),
    );

    const db = new Database(path.join(codexHome, "state_5.sqlite"));
    db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, created_at INTEGER, updated_at INTEGER, cwd TEXT, title TEXT, model_provider TEXT, model TEXT, tokens_used INTEGER, source TEXT, thread_source TEXT)");
    db.prepare("INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("imported-claude", rolloutPath, 1_779_099_600, 1_779_099_660, repo, "Imported Claude", "openai", null, 1100, "vscode", "user");
    db.close();

    const result = scanCodex({ codexHome, pricing: {} });

    expect(result.sessions[0]?.model).toBe("claude-sonnet-4-6");
    expect(result.sessions[0]?.provider).toBe("anthropic");
    expect(result.sessions[0]?.warnings).toContain("model_inferred_from_import_source");
  });

  it("keeps Codex startup context out of the prompt timeline", () => {
    const codexHome = makeTempDir();
    const repo = makeTempDir();
    fs.mkdirSync(path.join(repo, ".git"));
    const sessionsDir = path.join(codexHome, "sessions", "2026", "05", "18");
    fs.mkdirSync(sessionsDir, { recursive: true });
    const rolloutPath = path.join(sessionsDir, "rollout-startup-context.jsonl");
    fs.writeFileSync(
      rolloutPath,
      [
        JSON.stringify({
          timestamp: "2026-05-18T10:00:00.000Z",
          type: "event_msg",
          payload: {
            type: "user_message",
            message: "# AGENTS.md instructions for /repo <INSTRUCTIONS>Use RTK</INSTRUCTIONS> <environment_context><cwd>/repo</cwd></environment_context>",
          },
        }),
        JSON.stringify({
          timestamp: "2026-05-18T10:00:01.000Z",
          type: "event_msg",
          payload: {
            type: "user_message",
            message: "show me the repo summary",
          },
        }),
      ].join("\n"),
    );

    const db = new Database(path.join(codexHome, "state_5.sqlite"));
    db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, created_at INTEGER, updated_at INTEGER, cwd TEXT, title TEXT, model_provider TEXT, model TEXT, tokens_used INTEGER, source TEXT, thread_source TEXT)");
    db.prepare("INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("startup-context", rolloutPath, 1_779_099_600, 1_779_099_660, repo, "Startup context", "openai", "known-model", 0, "vscode", "user");
    db.close();

    const result = scanCodex({ codexHome, pricing: {} });

    expect(result.sessions[0]?.promptTimeline).toEqual([{ role: "user", text: "show me the repo summary", timestamp: "2026-05-18T10:00:01.000Z" }]);
    expect(result.sessions[0]?.userPromptCount).toBe(1);
  });

  it("imports Codex Desktop session metadata from standalone rollout logs", () => {
    const codexHome = makeTempDir();
    const repo = makeTempDir();
    fs.mkdirSync(path.join(repo, ".git"));
    const sessionsDir = path.join(codexHome, "sessions", "2026", "05", "19");
    fs.mkdirSync(sessionsDir, { recursive: true });
    const rolloutPath = path.join(sessionsDir, "rollout-2026-05-19T18-49-45-desktop-session.jsonl");
    fs.writeFileSync(
      rolloutPath,
      [
        JSON.stringify({
          timestamp: "2026-05-19T17:50:00.000Z",
          type: "session_meta",
          payload: {
            id: "desktop-session",
            timestamp: "2026-05-19T17:49:45.000Z",
            cwd: repo,
            originator: "Codex Desktop",
            source: "vscode",
            thread_source: "user",
            model_provider: "openai",
          },
        }),
        JSON.stringify({
          timestamp: "2026-05-19T17:50:01.000Z",
          type: "turn_context",
          payload: {
            cwd: repo,
            model: "gpt-5.5",
            collaboration_mode: { settings: { model: "gpt-5.5", reasoning_effort: "high" } },
          },
        }),
        JSON.stringify({
          timestamp: "2026-05-19T17:50:02.000Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Read the local Codex Desktop logs" }],
          },
        }),
        JSON.stringify({
          timestamp: "2026-05-19T17:50:03.000Z",
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: {
                input_tokens: 1000,
                cached_input_tokens: 400,
                output_tokens: 300,
                reasoning_output_tokens: 100,
                total_tokens: 1300,
              },
            },
          },
        }),
      ].join("\n"),
    );

    const db = new Database(path.join(codexHome, "state_5.sqlite"));
    db.exec("CREATE TABLE _sqlx_migrations (version INTEGER PRIMARY KEY)");
    db.close();

    const result = scanCodex({
      codexHome,
      pricing: {
        "gpt-5.5": {
          inputPerMillion: 5,
          cachedInputPerMillion: 0.5,
          outputPerMillion: 30,
          reasoningOutputPerMillion: 30,
        },
      },
    });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.id).toBe("desktop-session");
    expect(result.sessions[0]?.cwd).toBe(repo);
    expect(result.sessions[0]?.repoRoot).toBe(repo);
    expect(result.sessions[0]?.model).toBe("gpt-5.5");
    expect(result.sessions[0]?.provider).toBe("openai");
    expect(result.sessions[0]?.sourceApp).toBe("Codex Desktop");
    expect(result.sessions[0]?.sourceAppRaw).toBe("Codex Desktop");
    expect(result.sessions[0]?.detectedSurface).toBe("local_agent");
    expect(result.sessions[0]?.startedAt).toBe("2026-05-19T17:49:45.000Z");
    expect(result.sessions[0]?.endedAt).toBe("2026-05-19T17:50:03.000Z");
    expect(result.sessions[0]?.inputTokens).toBe(1000);
    expect(result.sessions[0]?.cachedInputTokens).toBe(400);
    expect(result.sessions[0]?.outputTokens).toBe(200);
    expect(result.sessions[0]?.reasoningOutputTokens).toBe(100);
    expect(result.sessions[0]?.totalTokens).toBe(1300);
    expect(result.sessions[0]?.estimatedCostUsd).toBe(0.0122);
    expect(result.sessions[0]?.promptTimeline).toEqual([{ role: "user", text: "Read the local Codex Desktop logs", timestamp: "2026-05-19T17:50:02.000Z" }]);
    expect(result.source.warnings).toContain("Codex SQLite state does not contain a threads table.");
  });

  it("imports standalone rollout logs alongside SQLite-backed threads", () => {
    const codexHome = makeTempDir();
    const repo = makeTempDir();
    fs.mkdirSync(path.join(repo, ".git"));
    const sessionsDir = path.join(codexHome, "sessions", "2026", "05", "19");
    fs.mkdirSync(sessionsDir, { recursive: true });
    const threadedPath = path.join(sessionsDir, "rollout-threaded-session.jsonl");
    fs.writeFileSync(
      threadedPath,
      JSON.stringify({
        timestamp: "2026-05-19T10:00:00.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: { total_token_usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } },
        },
      }),
    );
    const standalonePath = path.join(sessionsDir, "rollout-standalone-desktop.jsonl");
    fs.writeFileSync(
      standalonePath,
      [
        JSON.stringify({
          timestamp: "2026-05-19T11:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "standalone-desktop",
            cwd: repo,
            originator: "Codex Desktop",
            model_provider: "openai",
          },
        }),
        JSON.stringify({
          timestamp: "2026-05-19T11:00:01.000Z",
          type: "turn_context",
          payload: { model: "gpt-5.5" },
        }),
        JSON.stringify({
          timestamp: "2026-05-19T11:00:02.000Z",
          type: "event_msg",
          payload: {
            type: "token_count",
            info: { total_token_usage: { input_tokens: 200, output_tokens: 40, total_tokens: 240 } },
          },
        }),
      ].join("\n"),
    );

    const db = new Database(path.join(codexHome, "state_5.sqlite"));
    db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, created_at INTEGER, updated_at INTEGER, cwd TEXT, title TEXT, model_provider TEXT, model TEXT, tokens_used INTEGER, source TEXT, thread_source TEXT)");
    db.prepare("INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("threaded-session", threadedPath, 1_779_156_000, 1_779_156_001, repo, "Threaded", "openai", "gpt-5", 120, "vscode", "user");
    db.close();

    const result = scanCodex({ codexHome, pricing: {} });

    expect(result.sessions.map((session) => session.id).sort()).toEqual(["standalone-desktop", "threaded-session"]);
    expect(result.sessions.map((session) => session.totalTokens).sort((a, b) => a - b)).toEqual([120, 240]);
    expect(result.sessions.find((session) => session.id === "standalone-desktop")?.sourceApp).toBe("Codex Desktop");
  });

  it("labels Codex subagent sessions separately from the Codex app", () => {
    const codexHome = makeTempDir();
    const repo = makeTempDir();
    fs.mkdirSync(path.join(repo, ".git"));
    const sessionsDir = path.join(codexHome, "sessions", "2026", "05", "18");
    fs.mkdirSync(sessionsDir, { recursive: true });
    const rolloutPath = path.join(sessionsDir, "rollout-subagent.jsonl");
    fs.writeFileSync(
      rolloutPath,
      JSON.stringify({
        timestamp: "2026-05-18T10:00:00.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 100,
              output_tokens: 20,
              total_tokens: 120,
            },
          },
        },
      }),
    );

    const db = new Database(path.join(codexHome, "state_5.sqlite"));
    db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, created_at INTEGER, updated_at INTEGER, cwd TEXT, title TEXT, model_provider TEXT, model TEXT, tokens_used INTEGER, source TEXT, thread_source TEXT)");
    db.prepare("INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("subagent-session", rolloutPath, 1_779_099_600, 1_779_099_660, repo, "Subagent", "openai", "known-model", 120, "{\"subagent\":\"review\"}", "subagent");
    db.close();

    const result = scanCodex({ codexHome, pricing: {} });

    expect(result.sessions[0]?.sourceApp).toBe("Codex subagent");
    expect(result.sessions[0]?.detectedSurface).toBe("codex_exec");
  });

  it("attributes Codex subagents with parent metadata to the parent app surface", () => {
    const codexHome = makeTempDir();
    const repo = makeTempDir();
    fs.mkdirSync(path.join(repo, ".git"));
    const sessionsDir = path.join(codexHome, "sessions", "2026", "05", "18");
    fs.mkdirSync(sessionsDir, { recursive: true });
    const parentPath = path.join(sessionsDir, "rollout-parent-session.jsonl");
    fs.writeFileSync(
      parentPath,
      JSON.stringify({
        timestamp: "2026-05-18T10:00:00.000Z",
        type: "event_msg",
        payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } } },
      }),
    );
    const childPath = path.join(sessionsDir, "rollout-child-subagent.jsonl");
    fs.writeFileSync(
      childPath,
      JSON.stringify({
        timestamp: "2026-05-18T10:01:00.000Z",
        type: "event_msg",
        payload: { type: "token_count", info: { total_token_usage: { input_tokens: 50, output_tokens: 10, total_tokens: 60 } } },
      }),
    );

    const childSource = JSON.stringify({
      subagent: {
        thread_spawn: {
          parent_thread_id: "parent-session",
          depth: 1,
          agent_role: "explorer",
        },
      },
    });
    const db = new Database(path.join(codexHome, "state_5.sqlite"));
    db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, created_at INTEGER, updated_at INTEGER, cwd TEXT, title TEXT, model_provider TEXT, model TEXT, tokens_used INTEGER, source TEXT, thread_source TEXT)");
    db.prepare("INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("parent-session", parentPath, 1_779_099_600, 1_779_099_660, repo, "Parent", "openai", "known-model", 120, "vscode", "user");
    db.prepare("INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("child-subagent", childPath, 1_779_099_661, 1_779_099_700, repo, "Subagent", "openai", "known-model", 60, childSource, "subagent");
    db.close();

    const result = scanCodex({ codexHome, pricing: {} });
    const child = result.sessions.find((session) => session.id === "child-subagent");

    expect(child?.sourceApp).toBe("VS Code");
    expect(child?.detectedSurface).toBe("codex_exec");
    expect(child?.surfaceReason).toContain("subagent attributed to parent thread parent-session");
  });

  it("does not add direct usage on top of cumulative token snapshots", () => {
    const codexHome = makeTempDir();
    const repo = makeTempDir();
    fs.mkdirSync(path.join(repo, ".git"));
    const sessionsDir = path.join(codexHome, "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    const rolloutPath = path.join(sessionsDir, "mixed-session.jsonl");
    fs.writeFileSync(
      rolloutPath,
      [
        JSON.stringify({
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: {
                input_tokens: 100,
                cached_input_tokens: 50,
                output_tokens: 30,
                reasoning_output_tokens: 10,
                total_tokens: 140,
              },
            },
          },
        }),
        JSON.stringify({
          type: "response",
          usage: {
            input_tokens: 1_000,
            cached_input_tokens: 0,
            output_tokens: 1_000,
            reasoning_output_tokens: 0,
            total_tokens: 2_000,
          },
        }),
        JSON.stringify({
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: {
                input_tokens: 200,
                cached_input_tokens: 100,
                output_tokens: 60,
                reasoning_output_tokens: 20,
                total_tokens: 280,
              },
            },
          },
        }),
      ].join("\n"),
    );

    const db = new Database(path.join(codexHome, "state_5.sqlite"));
    db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, created_at INTEGER, updated_at INTEGER, cwd TEXT, title TEXT, model_provider TEXT, model TEXT, tokens_used INTEGER)");
    db.prepare("INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("mixed-session", rolloutPath, 1_779_099_600, 1_779_099_660, repo, "Mixed token test", "openai", "known-model", 280);
    db.close();

    const result = scanCodex({ codexHome, pricing: { "known-model": { inputPerMillion: 1, outputPerMillion: 1 } } });

    expect(result.sessions[0]?.inputTokens).toBe(200);
    expect(result.sessions[0]?.outputTokens).toBe(40);
    expect(result.sessions[0]?.reasoningOutputTokens).toBe(20);
    expect(result.sessions[0]?.totalTokens).toBe(280);
    expect(result.sessions[0]?.tokenAggregationMethod).toBe("final_snapshot");
    expect(result.sessions[0]?.tokenConfidence).toBe("high");
    expect(result.sessions[0]?.tokenSnapshotCount).toBe(3);
    expect(result.sessions[0]?.warnings).toContain("token_direct_usage_ignored_after_cumulative_snapshot");
  });

  it("classifies exploratory non-zero commands as harmless", () => {
    const codexHome = makeTempDir();
    const sessionsDir = path.join(codexHome, "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, "harmless.jsonl"),
      [
        JSON.stringify({ type: "exec_command", payload: { command: "rg missing-symbol src", exit_code: 1, stderr: "no matches" } }),
        JSON.stringify({
          type: "event_msg",
          payload: {
            type: "token_count",
            info: { total_token_usage: { input_tokens: 1000, output_tokens: 100, total_tokens: 1100 } },
          },
        }),
      ].join("\n"),
    );

    const result = scanCodex({ codexHome, pricing: {} });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.nonZeroCommandEvents).toBe(1);
    expect(result.sessions[0]?.harmlessNonZeroEvents).toBe(0);
    expect(result.sessions[0]?.exploratoryMisses).toBe(1);
    expect(result.sessions[0]?.importantCommandFailures).toBe(0);
    expect(result.sessions[0]?.failedToolCallCount).toBe(0);
    expect(result.sessions[0]?.commandIssueSeverity).toBe("ignored");
    expect(result.sessions[0]?.sessionOutcome).toBe("setup_debugging");
  });

  it("classifies build command non-zero exits as important command issues", () => {
    const codexHome = makeTempDir();
    const sessionsDir = path.join(codexHome, "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, "build-failure.jsonl"),
      [
        JSON.stringify({ type: "exec_command", payload: { command: "pnpm build", exit_code: 1, stderr: "tsc failed" } }),
        JSON.stringify({
          type: "event_msg",
          payload: {
            type: "token_count",
            info: { total_token_usage: { input_tokens: 1000, output_tokens: 100, total_tokens: 1100 } },
          },
        }),
      ].join("\n"),
    );

    const result = scanCodex({ codexHome, pricing: {} });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.nonZeroCommandEvents).toBe(1);
    expect(result.sessions[0]?.importantCommandFailures).toBe(1);
    expect(result.sessions[0]?.harmlessNonZeroEvents).toBe(0);
    expect(result.sessions[0]?.topFailureType).toBe("build");
    expect(result.sessions[0]?.commandIssueSeverity).toBe("warning");
    expect(result.sessions[0]?.commandIssueImpact).toBe("high");
    expect(result.sessions[0]?.failedToolCallCount).toBe(1);
    expect(result.sessions[0]?.sessionOutcome).toBe("partial");
  });
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repospend-codex-"));
  tempDirs.push(dir);
  return dir;
}
