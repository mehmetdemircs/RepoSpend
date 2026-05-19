import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanClaude } from "./claude.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Claude Code adapter", () => {
  it("handles a missing Claude directory gracefully", () => {
    const claudeHome = makeTempDir();
    fs.rmSync(claudeHome, { recursive: true, force: true });

    const result = scanClaude({ claudeHome, pricing: {} });

    expect(result.sessions).toEqual([]);
    expect(result.source.available).toBe(false);
    expect(result.source.warnings.some((warning) => warning.includes("projects directory not found"))).toBe(true);
  });

  it("handles an empty Claude projects directory", () => {
    const claudeHome = makeTempDir();
    fs.mkdirSync(path.join(claudeHome, "projects"), { recursive: true });

    const result = scanClaude({ claudeHome, pricing: {} });

    expect(result.sessions).toEqual([]);
    expect(result.source.available).toBe(false);
    expect(result.stats.projectsExists).toBe(true);
    expect(result.stats.sessionFileCount).toBe(0);
  });

  it("parses a valid Claude session and calculates API-equivalent cost", () => {
    const claudeHome = makeTempDir();
    const repo = makeTempDir();
    fs.mkdirSync(path.join(repo, ".git"));
    const projectDir = path.join(claudeHome, "projects", "-tmp-repospend-claude");
    fs.mkdirSync(projectDir, { recursive: true });
    const sessionPath = path.join(projectDir, "session-a.jsonl");
    fs.writeFileSync(
      sessionPath,
      [
        JSON.stringify({ type: "user", sessionId: "session-a", timestamp: "2026-05-18T10:00:00.000Z", cwd: repo, gitBranch: "main", entrypoint: "cli", message: { role: "user", content: "synthetic prompt" } }),
        JSON.stringify({ type: "ai-title", sessionId: "session-a", aiTitle: "Synthetic Claude session" }),
        JSON.stringify({
          type: "assistant",
          sessionId: "session-a",
          timestamp: "2026-05-18T10:00:02.000Z",
          cwd: repo,
          message: {
            role: "assistant",
            model: "claude-sonnet-4-5-20250929",
            content: [{ type: "text", text: "synthetic assistant reply" }, { type: "tool_use", name: "Edit" }],
            usage: {
              input_tokens: 1_000_000,
              cache_creation_input_tokens: 100_000,
              cache_read_input_tokens: 200_000,
              output_tokens: 300_000,
            },
          },
        }),
      ].join("\n"),
    );

    const result = scanClaude({ claudeHome, pricing: { "claude-sonnet-4-5": { inputPerMillion: 3, cacheCreationInputPerMillion: 3.75, cachedInputPerMillion: 0.3, outputPerMillion: 15 } } });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.sourceClient).toBe("claude");
    expect(result.sessions[0]?.sourceApp).toBe("Terminal");
    expect(result.sessions[0]?.detectedSurface).toBe("terminal_cli");
    expect(result.sessions[0]?.repoRoot).toBe(repo);
    expect(result.sessions[0]?.model).toBe("claude-sonnet-4-5-20250929");
    expect(result.sessions[0]?.inputTokens).toBe(1_300_000);
    expect(result.sessions[0]?.cacheCreationInputTokens).toBe(100_000);
    expect(result.sessions[0]?.cachedInputTokens).toBe(200_000);
    expect(result.sessions[0]?.outputTokens).toBe(300_000);
    expect(result.sessions[0]?.totalTokens).toBe(1_600_000);
    expect(result.sessions[0]?.tokenAggregationMethod).toBe("direct_usage");
    expect(result.sessions[0]?.estimatedCostUsd).toBe(7.935);
    expect(result.sessions[0]?.messageCount).toBe(2);
    expect(result.sessions[0]?.fileEditCount).toBe(1);
    expect(result.sessions[0]?.promptTimeline).toEqual([
      { role: "user", text: "synthetic prompt", timestamp: "2026-05-18T10:00:00.000Z" },
      { role: "assistant", text: "synthetic assistant reply", timestamp: "2026-05-18T10:00:02.000Z" },
    ]);
    expect(result.sessions[0]?.title).toBe("Synthetic Claude session");
  });

  it("imports desktop local-agent session files without a projects path segment", () => {
    const home = makeTempDir();
    const repo = makeTempDir();
    fs.mkdirSync(path.join(repo, ".git"));
    const sessionDir = path.join(home, ".config", "Claude", "local-agent-mode-sessions", "local-session");
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, "audit.jsonl"),
      JSON.stringify({
        type: "assistant",
        sessionId: "local-session",
        timestamp: "2026-05-18T10:00:00.000Z",
        cwd: repo,
        entrypoint: "local-agent",
        message: { role: "assistant", model: "claude-haiku-4-5", usage: { input_tokens: 100, output_tokens: 20 } },
      }),
    );

    const result = withEnv({ HOME: home, XDG_CONFIG_HOME: path.join(home, ".config") }, () => scanClaude({ pricing: { "claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5 } } }));

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.id).toBe("local-session");
    expect(result.sessions[0]?.sourceApp).toBe("Claude desktop local agent");
    expect(result.sessions[0]?.detectedSurface).toBe("local_agent");
    expect(result.sessions[0]?.repoRoot).toBe(repo);
  });

  it("does not mark successful tool output as failed just because it mentions errors", () => {
    const claudeHome = makeTempDir();
    const projectDir = path.join(claudeHome, "projects", "-tmp-no-failed-tool");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "tool-result.jsonl"),
      [
        JSON.stringify({ type: "assistant", sessionId: "tool-result", timestamp: "2026-05-18T10:00:00.000Z", message: { role: "assistant", model: "claude-haiku-4-5", usage: { input_tokens: 100, output_tokens: 20 } } }),
        JSON.stringify({ type: "user", sessionId: "tool-result", timestamp: "2026-05-18T10:00:01.000Z", toolUseResult: { content: "No errors found", exit_code: 0 } }),
      ].join("\n"),
    );

    const result = scanClaude({ claudeHome, pricing: { "claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5 } } });

    expect(result.sessions[0]?.failedToolCallCount).toBe(0);
    expect(result.sessions[0]?.commandIssueSeverity).toBe("none");
  });

  it("normalizes Claude VS Code entrypoints as app/surface metadata", () => {
    const claudeHome = makeTempDir();
    const projectDir = path.join(claudeHome, "projects", "-tmp-vscode");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "vscode.jsonl"),
      JSON.stringify({
        type: "assistant",
        sessionId: "vscode",
        timestamp: "2026-05-18T10:00:00.000Z",
        cwd: "/tmp/vscode",
        entrypoint: "claude-vscode",
        message: { role: "assistant", model: "claude-sonnet-4-5", usage: { input_tokens: 100, output_tokens: 20 } },
      }),
    );

    const result = scanClaude({ claudeHome, pricing: { "claude-sonnet-4-5": { inputPerMillion: 3, outputPerMillion: 15 } } });

    expect(result.sessions[0]?.sourceApp).toBe("VS Code");
    expect(result.sessions[0]?.sourceAppRaw).toBe("claude-vscode");
    expect(result.sessions[0]?.detectedSurface).toBe("vscode_extension");
  });

  it("ignores synthetic zero-usage Claude model markers", () => {
    const claudeHome = makeTempDir();
    const projectDir = path.join(claudeHome, "projects", "-tmp-synthetic");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "synthetic.jsonl"),
      [
        JSON.stringify({ type: "assistant", sessionId: "synthetic", timestamp: "2026-05-18T10:00:00.000Z", message: { role: "assistant", model: "claude-opus-4-7", usage: { input_tokens: 100, output_tokens: 20 } } }),
        JSON.stringify({ type: "assistant", sessionId: "synthetic", timestamp: "2026-05-18T10:01:00.000Z", message: { role: "assistant", model: "<synthetic>", usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } } }),
      ].join("\n"),
    );

    const result = scanClaude({ claudeHome, pricing: { "claude-opus-4-7": { inputPerMillion: 5, outputPerMillion: 25 } } });

    expect(result.sessions[0]?.model).toBe("claude-opus-4-7");
    expect(result.sessions[0]?.tokenSnapshotCount).toBe(1);
  });

  it("counts Claude history entries but does not import history-only sessions", () => {
    const claudeHome = makeTempDir();
    fs.mkdirSync(path.join(claudeHome, "projects"), { recursive: true });
    fs.writeFileSync(
      path.join(claudeHome, "history.jsonl"),
      JSON.stringify({ sessionId: "history-only", timestamp: "2026-05-18T10:00:00.000Z", project: "/tmp/history-only", display: "private prompt text not imported" }),
    );

    const result = scanClaude({ claudeHome, pricing: {} });

    expect(result.sessions).toHaveLength(0);
    expect(result.source.available).toBe(true);
    expect(result.stats.historyEntryCount).toBe(1);
  });

  it("keeps malformed Claude files from crashing the scan", () => {
    const claudeHome = makeTempDir();
    const projectDir = path.join(claudeHome, "projects", "-tmp-malformed");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "broken.jsonl"), "{not json}\n");

    const result = scanClaude({ claudeHome, pricing: {} });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.parseStatus).toBe("failed");
    expect(result.stats.malformedFileCount).toBe(1);
  });

  it("marks missing token counts as unknown cost", () => {
    const claudeHome = makeTempDir();
    const projectDir = path.join(claudeHome, "projects", "-tmp-no-tokens");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "no-tokens.jsonl"),
      JSON.stringify({ type: "user", sessionId: "no-tokens", timestamp: "2026-05-18T10:00:00.000Z", cwd: "/tmp/no-tokens", message: { role: "user", content: "synthetic prompt" } }),
    );

    const result = scanClaude({ claudeHome, pricing: { "claude-sonnet-4-5": { inputPerMillion: 3, outputPerMillion: 15 } } });

    expect(result.sessions[0]?.totalTokens).toBe(0);
    expect(result.sessions[0]?.estimatedCostUsd).toBeUndefined();
    expect(result.sessions[0]?.warnings).toContain("missing_token_breakdown");
    expect(result.sessions[0]?.warnings).toContain("unknown_pricing");
  });

  it("falls back to the Claude project directory when cwd is absent", () => {
    const claudeHome = makeTempDir();
    const projectDir = path.join(claudeHome, "projects", "-tmp-repospend-fallback");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "fallback.jsonl"),
      JSON.stringify({ type: "assistant", sessionId: "fallback", timestamp: "2026-05-18T10:00:00.000Z", message: { role: "assistant", model: "claude-haiku-4-5", usage: { input_tokens: 100, output_tokens: 20 } } }),
    );

    const result = scanClaude({ claudeHome, pricing: { "claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5 } } });

    expect(result.sessions[0]?.cwd).toBe(path.join(path.sep, "tmp", "repospend", "fallback"));
    expect(result.sessions[0]?.warnings).toContain("repo_inferred_from_claude_project_dir");
  });
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repospend-claude-"));
  tempDirs.push(dir);
  return dir;
}

function withEnv<T>(env: Record<string, string>, callback: () => T): T {
  const previous = new Map(Object.keys(env).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(env)) {
      process.env[key] = value;
    }
    return callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
