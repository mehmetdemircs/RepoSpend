import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanCopilot } from "./copilot.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.COPILOT_OTEL_FILE_EXPORTER_PATH;
});

describe("Copilot adapter", () => {
  it("handles a missing Copilot directory gracefully", () => {
    const copilotHome = makeTempDir();
    fs.rmSync(copilotHome, { recursive: true, force: true });

    const result = scanCopilot({ copilotHome, pricing: {} });

    expect(result.sessions).toEqual([]);
    expect(result.source.available).toBe(false);
    expect(result.source.warnings.some((warning) => warning.includes("GitHub Copilot home directory not found"))).toBe(true);
  });

  it("parses Copilot OTEL chat spans with cache, reasoning, cost, and RepoSpend input semantics", () => {
    const copilotHome = makeTempDir();
    const otelPath = path.join(copilotHome, "otel");
    fs.mkdirSync(otelPath, { recursive: true });
    fs.writeFileSync(
      path.join(otelPath, "copilot.jsonl"),
      [
        JSON.stringify({ type: "metric", name: "gen_ai.client.token.usage" }),
        JSON.stringify({
          type: "span",
          traceId: "trace-1",
          spanId: "span-1",
          name: "chat claude-sonnet-4.5",
          startTime: [1_775_934_260, 133_000_000],
          endTime: [1_775_934_264, 967_317_833],
          attributes: {
            "gen_ai.operation.name": "chat",
            "gen_ai.request.model": "claude-sonnet-4.5",
            "gen_ai.response.model": "claude-sonnet-4.5",
            "gen_ai.conversation.id": "conv-1",
            "gen_ai.usage.input_tokens": 19_452,
            "gen_ai.usage.output_tokens": 281,
            "gen_ai.usage.cache_read.input_tokens": 123,
            "gen_ai.usage.cache_creation.input_tokens": 25,
            "gen_ai.usage.reasoning.output_tokens": 128,
          },
        }),
      ].join("\n"),
    );

    const result = scanCopilot({
      copilotHome,
      pricing: { "claude-sonnet-4-5": { inputPerMillion: 3, cachedInputPerMillion: 0.3, cacheCreationInputPerMillion: 3.75, outputPerMillion: 15, reasoningOutputPerMillion: 15 } },
    });

    expect(result.sessions).toHaveLength(1);
    expect(result.stats.otelFileCount).toBe(1);
    expect(result.sessions[0]?.sourceClient).toBe("copilot");
    expect(result.sessions[0]?.sourceApp).toBe("Copilot CLI");
    expect(result.sessions[0]?.id).toBe("conv-1");
    expect(result.sessions[0]?.model).toBe("claude-sonnet-4-5");
    expect(result.sessions[0]?.inputTokens).toBe(19_452);
    expect(result.sessions[0]?.cachedInputTokens).toBe(123);
    expect(result.sessions[0]?.cacheCreationInputTokens).toBe(25);
    expect(result.sessions[0]?.outputTokens).toBe(281);
    expect(result.sessions[0]?.reasoningTokens).toBe(128);
    expect(result.sessions[0]?.totalTokens).toBe(19_861);
    expect(result.sessions[0]?.estimatedCostUsd).toBe(0.064178);
    expect(result.sessions[0]?.durationMs).toBe(4834);
  });

  it("suppresses lower-priority Copilot OTEL records for the same response", () => {
    const copilotHome = makeTempDir();
    const otelPath = path.join(copilotHome, "otel");
    fs.mkdirSync(otelPath, { recursive: true });
    fs.writeFileSync(
      path.join(otelPath, "copilot.jsonl"),
      [
        JSON.stringify({ type: "span", traceId: "trace-dupe", spanId: "agent-1", name: "invoke_agent GitHub Copilot Chat", attributes: { "gen_ai.operation.name": "invoke_agent", "gen_ai.response.model": "gpt-5.4-mini", "gen_ai.response.id": "resp-dupe", "gen_ai.usage.input_tokens": 100, "gen_ai.usage.output_tokens": 30 } }),
        JSON.stringify({ hrTime: [1_775_934_263, 0], attributes: { "event.name": "gen_ai.client.inference.operation.details", "gen_ai.response.model": "gpt-5.4-mini", "gen_ai.response.id": "resp-dupe", "gen_ai.usage.input_tokens": 80, "gen_ai.usage.output_tokens": 20 }, _body: "GenAI inference: gpt-5.4-mini" }),
        JSON.stringify({ type: "span", traceId: "trace-dupe", spanId: "chat-1", name: "chat gpt-5.4-mini", attributes: { "gen_ai.operation.name": "chat", "gen_ai.response.model": "gpt-5.4-mini", "gen_ai.response.id": "resp-dupe", "gen_ai.usage.input_tokens": 60, "gen_ai.usage.output_tokens": 10 } }),
      ].join("\n"),
    );

    const result = scanCopilot({ copilotHome, pricing: { "gpt-5.4-mini": { inputPerMillion: 1, outputPerMillion: 10 } } });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.inputTokens).toBe(60);
    expect(result.sessions[0]?.outputTokens).toBe(10);
    expect(result.sessions[0]?.totalTokens).toBe(70);
  });

  it("dedupes repeated Copilot OTEL records with the same span identity", () => {
    const copilotHome = makeTempDir();
    const otelPath = path.join(copilotHome, "otel");
    fs.mkdirSync(otelPath, { recursive: true });
    const span = { type: "span", traceId: "trace-repeat", spanId: "span-repeat", name: "chat gpt-5-mini", attributes: { "gen_ai.operation.name": "chat", "gen_ai.response.model": "gpt-5-mini", "gen_ai.usage.input_tokens": 100, "gen_ai.usage.output_tokens": 20 } };
    fs.writeFileSync(path.join(otelPath, "copilot.jsonl"), [JSON.stringify(span), JSON.stringify(span)].join("\n"));

    const result = scanCopilot({ copilotHome, pricing: { "gpt-5-mini": { inputPerMillion: 1, outputPerMillion: 10 } } });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.inputTokens).toBe(100);
    expect(result.sessions[0]?.outputTokens).toBe(20);
    expect(result.sessions[0]?.totalTokens).toBe(120);
  });

  it("ignores transcript-only token fallback fields in OTEL files", () => {
    const copilotHome = makeTempDir();
    const otelPath = path.join(copilotHome, "otel");
    fs.mkdirSync(otelPath, { recursive: true });
    fs.writeFileSync(
      path.join(otelPath, "copilot.jsonl"),
      [
        JSON.stringify({ type: "assistant.message", data: { sessionId: "otel-session", model: "gpt-5-mini", outputTokens: 999 }, timestamp: "2026-05-24T17:55:53.608Z" }),
        JSON.stringify({ type: "span", traceId: "trace-otel", spanId: "span-otel", name: "chat gpt-5-mini", attributes: { "gen_ai.operation.name": "chat", "gen_ai.conversation.id": "otel-session", "gen_ai.response.model": "gpt-5-mini", "gen_ai.usage.input_tokens": 100, "gen_ai.usage.output_tokens": 20 } }),
      ].join("\n"),
    );

    const result = scanCopilot({ copilotHome, pricing: { "gpt-5-mini": { inputPerMillion: 1, outputPerMillion: 10 } } });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.outputTokens).toBe(20);
    expect(result.sessions[0]?.totalTokens).toBe(120);
  });

  it("dedupes exact Copilot OTEL repeats across files while keeping distinct turns", () => {
    const copilotHome = makeTempDir();
    const otelPath = path.join(copilotHome, "otel");
    fs.mkdirSync(otelPath, { recursive: true });
    const firstSpan = { type: "span", traceId: "trace-repeat-cross-file", spanId: "span-repeat", name: "chat gpt-5-mini", attributes: { "gen_ai.operation.name": "chat", "gen_ai.conversation.id": "conv-repeat-cross-file", "gen_ai.response.model": "gpt-5-mini", "gen_ai.usage.input_tokens": 100, "gen_ai.usage.output_tokens": 20 } };
    const secondSpan = { type: "span", traceId: "trace-new-cross-file", spanId: "span-new", name: "chat gpt-5-mini", attributes: { "gen_ai.operation.name": "chat", "gen_ai.conversation.id": "conv-repeat-cross-file", "gen_ai.response.model": "gpt-5-mini", "gen_ai.usage.input_tokens": 50, "gen_ai.usage.output_tokens": 10 } };
    fs.writeFileSync(path.join(otelPath, "copilot-1.jsonl"), JSON.stringify(firstSpan));
    fs.writeFileSync(path.join(otelPath, "copilot-2.jsonl"), [JSON.stringify(firstSpan), JSON.stringify(secondSpan)].join("\n"));

    const result = scanCopilot({ copilotHome, pricing: { "gpt-5-mini": { inputPerMillion: 1, outputPerMillion: 10 } } });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.inputTokens).toBe(150);
    expect(result.sessions[0]?.outputTokens).toBe(30);
    expect(result.sessions[0]?.totalTokens).toBe(180);
    expect(result.sessions[0]?.tokenSnapshotCount).toBe(2);
    expect(result.sessions[0]?.warnings).toContain("copilot_duplicate_session_merged");
  });

  it("does not attribute cwd-less Copilot OTEL sessions to the RepoSpend launch directory", () => {
    const copilotHome = makeTempDir();
    const otelPath = path.join(copilotHome, "otel");
    fs.mkdirSync(otelPath, { recursive: true });
    fs.writeFileSync(path.join(otelPath, "copilot.jsonl"), JSON.stringify({ type: "span", traceId: "trace-no-cwd", spanId: "span-no-cwd", name: "chat gpt-5-mini", attributes: { "gen_ai.operation.name": "chat", "gen_ai.response.model": "gpt-5-mini", "gen_ai.usage.input_tokens": 100, "gen_ai.usage.output_tokens": 20 } }));

    const result = scanCopilot({ copilotHome, pricing: { "gpt-5-mini": { inputPerMillion: 1, outputPerMillion: 10 } } });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.cwd).toBe("");
    expect(result.sessions[0]?.repoRoot).toBe("unknown-copilot-repo");
    expect(result.sessions[0]?.repoName).toBe("Unknown repo/folder");
    expect(result.sessions[0]?.warnings).toContain("copilot_missing_cwd");
  });

  it("keeps detailed OTEL token data when a VS Code transcript has duplicate output-only data", () => {
    const home = makeTempDir();
    const copilotHome = path.join(home, ".copilot");
    const otelPath = path.join(copilotHome, "otel");
    fs.mkdirSync(otelPath, { recursive: true });
    fs.writeFileSync(
      path.join(otelPath, "copilot.jsonl"),
      JSON.stringify({ type: "span", traceId: "trace-cross-file", spanId: "span-cross-file", name: "chat gpt-5-mini", attributes: { "gen_ai.operation.name": "chat", "gen_ai.conversation.id": "session-cross-file", "gen_ai.response.model": "gpt-5-mini", "gen_ai.usage.input_tokens": 100, "gen_ai.usage.output_tokens": 20 } }),
    );
    const userRoot = testCodeUserRoot(home);
    const workspaceRoot = path.join(userRoot, "workspaceStorage", "workspace-a");
    const transcriptRoot = path.join(workspaceRoot, "GitHub.copilot-chat", "transcripts");
    fs.mkdirSync(transcriptRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, "workspace.json"), JSON.stringify({ folder: "file:///tmp/repospend-copilot-workspace" }));
    fs.writeFileSync(
      path.join(transcriptRoot, "session-cross-file.jsonl"),
      [
        JSON.stringify({ type: "session.start", data: { sessionId: "session-cross-file" }, timestamp: "2026-05-24T17:55:47.405Z" }),
        JSON.stringify({ type: "assistant.message", data: { outputTokens: 999, content: "Done." }, timestamp: "2026-05-24T17:55:53.608Z" }),
      ].join("\n"),
    );

    const result = scanCopilot({ copilotHome, codeUserRoots: [userRoot], pricing: { "gpt-5-mini": { inputPerMillion: 1, outputPerMillion: 10 } } });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.inputTokens).toBe(100);
    expect(result.sessions[0]?.outputTokens).toBe(20);
    expect(result.sessions[0]?.totalTokens).toBe(120);
    expect(result.sessions[0]?.warnings).toContain("copilot_duplicate_session_merged");
  });

  it("reports malformed Copilot files from file parse stats", () => {
    const copilotHome = makeTempDir();
    const otelPath = path.join(copilotHome, "otel");
    fs.mkdirSync(otelPath, { recursive: true });
    fs.writeFileSync(
      path.join(otelPath, "malformed.jsonl"),
      [
        JSON.stringify({ type: "span", traceId: "trace-malformed", spanId: "span-malformed", name: "chat gpt-5-mini", attributes: { "gen_ai.operation.name": "chat", "gen_ai.response.model": "gpt-5-mini", "gen_ai.usage.input_tokens": 10, "gen_ai.usage.output_tokens": 2 } }),
        "{not-json",
      ].join("\n"),
    );

    const result = scanCopilot({ copilotHome, pricing: { "gpt-5-mini": { inputPerMillion: 1, outputPerMillion: 10 } } });

    expect(result.sessions).toHaveLength(1);
    expect(result.stats.parseFailureCount).toBe(1);
    expect(result.stats.malformedFileCount).toBe(1);
    expect(result.stats.unreadableFileCount).toBe(0);
  });

  it("prices Copilot lark suffix variants through the lark family", () => {
    const copilotHome = makeTempDir();
    const otelPath = path.join(copilotHome, "otel");
    fs.mkdirSync(otelPath, { recursive: true });
    fs.writeFileSync(path.join(otelPath, "copilot.jsonl"), JSON.stringify({ type: "span", traceId: "trace-lark", spanId: "span-lark", name: "chat lark-vscode-preview", attributes: { "gen_ai.operation.name": "chat", "gen_ai.response.model": "lark-vscode-preview", "gen_ai.usage.input_tokens": 1_000_000, "gen_ai.usage.output_tokens": 1_000_000 } }));

    const result = scanCopilot({ copilotHome, pricing: { lark: { inputPerMillion: 0.25, outputPerMillion: 2 } } });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.model).toBe("lark-vscode-preview");
    expect(result.sessions[0]?.provider).toBe("github-copilot");
    expect(result.sessions[0]?.estimatedCostUsd).toBe(2.25);
  });

  it("imports VS Code Copilot transcripts without inventing missing token data", () => {
    const home = makeTempDir();
    const copilotHome = path.join(home, ".copilot");
    const userRoot = testCodeUserRoot(home);
    const workspaceRoot = path.join(userRoot, "workspaceStorage", "workspace-a");
    const transcriptRoot = path.join(workspaceRoot, "GitHub.copilot-chat", "transcripts");
    const chatSessionRoot = path.join(workspaceRoot, "chatSessions");
    fs.mkdirSync(transcriptRoot, { recursive: true });
    fs.mkdirSync(chatSessionRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, "workspace.json"), JSON.stringify({ folder: "file:///tmp/repospend-copilot-workspace" }));
    fs.writeFileSync(
      path.join(transcriptRoot, "session-a.jsonl"),
      [
        JSON.stringify({ type: "session.start", data: { sessionId: "session-a", startTime: "2026-05-24T17:55:47.405Z" }, timestamp: "2026-05-24T17:55:47.405Z" }),
        JSON.stringify({ type: "user.message", data: { content: "review my changes" }, timestamp: "2026-05-24T17:55:47.405Z" }),
        JSON.stringify({ type: "assistant.message", data: { content: "Reviewing now.", toolRequests: [{ name: "run_in_terminal", arguments: "{\"command\":\"git status\"}" }] }, timestamp: "2026-05-24T17:55:53.608Z" }),
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(chatSessionRoot, "session-a.jsonl"),
      JSON.stringify({
        v: {
          sessionId: "session-a",
          inputState: {
            selectedModel: {
              identifier: "copilot/auto",
              metadata: { family: "gpt-5-mini", version: "gpt-5-mini" },
            },
          },
          metadata: { resolvedModel: "oswe-vscode-prime" },
        },
      }),
    );

    const result = scanCopilot({ copilotHome, codeUserRoots: [userRoot], pricing: {} });

    expect(result.sessions).toHaveLength(1);
    expect(result.stats.transcriptFileCount).toBe(1);
    expect(result.sessions[0]?.id).toBe("session-a");
    expect(result.sessions[0]?.sourceApp).toBe("VS Code");
    expect(result.sessions[0]?.model).toBe("gpt-5-mini");
    expect(result.sessions[0]?.totalTokens).toBe(0);
    expect(result.sessions[0]?.estimatedCostUsd).toBeUndefined();
    expect(result.sessions[0]?.warnings).toContain("missing_token_breakdown");
    expect(result.sessions[0]?.userPromptCount).toBe(1);
    expect(result.sessions[0]?.assistantMessageCount).toBe(1);
    expect(result.sessions[0]?.shellCommandCount).toBe(1);
  });

  it("includes the explicit COPILOT_OTEL_FILE_EXPORTER_PATH file", () => {
    const copilotHome = makeTempDir();
    const explicitDir = makeTempDir();
    const explicitFile = path.join(explicitDir, "explicit.jsonl");
    fs.writeFileSync(explicitFile, JSON.stringify({ type: "span", traceId: "trace-env", spanId: "span-env", name: "chat gpt-5-mini", attributes: { "gen_ai.operation.name": "chat", "gen_ai.response.model": "gpt-5-mini", "gen_ai.usage.input_tokens": 10, "gen_ai.usage.output_tokens": 2 } }));
    process.env.COPILOT_OTEL_FILE_EXPORTER_PATH = explicitFile;

    const result = scanCopilot({ copilotHome, pricing: { "gpt-5-mini": { inputPerMillion: 1, outputPerMillion: 10 } } });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.id).toBe("trace-env");
    expect(result.sessions[0]?.totalTokens).toBe(12);
  });

  it("imports Copilot CLI session-state events as partial output-token data", () => {
    const copilotHome = makeTempDir();
    const sessionDir = path.join(copilotHome, "session-state", "session-state-a");
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, "workspace.yaml"), "cwd: /tmp/copilot-cli-workspace\n");
    fs.writeFileSync(
      path.join(sessionDir, "events.jsonl"),
      [
        JSON.stringify({ type: "session.start", data: { sessionId: "session-state-a", startTime: "2026-05-24T17:52:43.304Z", context: { cwd: "/tmp/copilot-cli-workspace" } }, timestamp: "2026-05-24T17:52:43.304Z" }),
        JSON.stringify({ type: "session.model_change", data: { newModel: "gpt-5-mini" }, timestamp: "2026-05-24T17:52:44.008Z" }),
        JSON.stringify({ type: "assistant.message", data: { outputTokens: 520, content: "Done." }, timestamp: "2026-05-24T17:52:53.137Z" }),
      ].join("\n"),
    );

    const result = scanCopilot({ copilotHome, pricing: { "gpt-5-mini": { inputPerMillion: 1, outputPerMillion: 10 } } });

    expect(result.sessions).toHaveLength(1);
    expect(result.stats.sessionStateFileCount).toBe(1);
    expect(result.sessions[0]?.id).toBe("session-state-a");
    expect(result.sessions[0]?.model).toBe("gpt-5-mini");
    expect(result.sessions[0]?.outputTokens).toBe(520);
    expect(result.sessions[0]?.totalTokens).toBe(520);
    expect(result.sessions[0]?.estimatedCostUsd).toBeUndefined();
    expect(result.sessions[0]?.warnings).toContain("copilot_partial_token_breakdown");
  });
});

function testCodeUserRoot(home: string): string {
  if (process.platform === "win32") return path.join(home, "AppData", "Roaming", "Code", "User");
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "Code", "User");
  return path.join(home, ".config", "Code", "User");
}

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repospend-copilot-"));
  tempDirs.push(dir);
  return dir;
}
