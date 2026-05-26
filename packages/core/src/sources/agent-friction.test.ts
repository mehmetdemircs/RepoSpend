import { describe, expect, it } from "vitest";
import { analyzeAgentFriction } from "./agent-friction.js";

describe("Agent Friction analysis", () => {
  it("classifies exploratory search misses as harmless", () => {
    const analysis = analyzeAgentFriction([
      { type: "exec_command", payload: { command: "rg missing-symbol src", exit_code: 1, stderr: "no matches" } },
    ], 1_000);

    expect(analysis.nonZeroCommandEvents).toBe(1);
    expect(analysis.harmlessNonZeroEvents).toBe(0);
    expect(analysis.exploratoryMisses).toBe(1);
    expect(analysis.importantCommandFailures).toBe(0);
    expect(analysis.commandIssueSeverity).toBe("ignored");
  });

  it("promotes repeated command failures to critical blocking failures", () => {
    const records = Array.from({ length: 3 }, () => ({
      type: "exec_command",
      payload: { command: "pnpm test", exit_code: 1, stderr: "test failed" },
    }));

    const analysis = analyzeAgentFriction(records, 10_000);

    expect(analysis.repeatedFailureClusters).toBe(1);
    expect(analysis.importantCommandFailures).toBe(3);
    expect(analysis.commandIssueSeverity).toBe("critical");
    expect(analysis.commandIssueImpact).toBe("high");
    expect(analysis.topFailureType).toBe("test");
  });

  it("does not flag source or output text that merely mentions exit_code", () => {
    const analysis = analyzeAgentFriction([
      {
        type: "response_item",
        payload: {
          type: "function_call_output",
          output: "function example() { return text.includes('exit_code') && !text.includes('exit_code: 0'); }\nProcess exited with code 0",
        },
      },
    ], 2_000_000);

    expect(analysis.nonZeroCommandEvents).toBe(0);
    expect(analysis.importantCommandFailures).toBe(0);
    expect(analysis.commandIssueSeverity).toBe("none");
  });

  it("does not treat generic status codes as command exits", () => {
    const analysis = analyzeAgentFriction([
      {
        type: "response_item",
        payload: {
          type: "message",
          status_code: 404,
          output: "HTTP response was not found",
        },
      },
    ], 10_000);

    expect(analysis.nonZeroCommandEvents).toBe(0);
    expect(analysis.importantCommandFailures).toBe(0);
  });

  it("does not treat status codes on command records as process exits", () => {
    const analysis = analyzeAgentFriction([
      {
        type: "exec_command",
        payload: {
          command: "node scripts/check-api.js",
          status_code: 404,
          output: "HTTP response was not found",
        },
      },
    ], 10_000);

    expect(analysis.nonZeroCommandEvents).toBe(0);
    expect(analysis.importantCommandFailures).toBe(0);
  });

  it("flags structured tool output with a non-zero process exit code", () => {
    const analysis = analyzeAgentFriction([
      {
        type: "response_item",
        payload: {
          type: "function_call_output",
          output: "Chunk ID: abc\nProcess exited with code 1\nOutput:\ntsc failed",
        },
      },
    ], 10_000);

    expect(analysis.nonZeroCommandEvents).toBe(1);
    expect(analysis.importantCommandFailures).toBe(1);
    expect(analysis.commandIssueSeverity).toBe("warning");
  });

  it("uses paired function call arguments as the failed command evidence", () => {
    const analysis = analyzeAgentFriction([
      {
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          call_id: "call_1",
          arguments: JSON.stringify({ cmd: "pnpm typecheck" }),
        },
      },
      {
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call_1",
          output: "Chunk ID: abc\nProcess exited with code 1\nOutput:\ntsc failed",
        },
      },
    ], 10_000);

    expect(analysis.commandIssueSamples[0]?.command).toBe("pnpm typecheck");
    expect(analysis.topFailureType).toBe("typecheck");
  });

  it("attributes write_stdin failures to the command that opened the session", () => {
    const analysis = analyzeAgentFriction([
      {
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          call_id: "call_start",
          arguments: JSON.stringify({ cmd: "pnpm build" }),
        },
      },
      {
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call_start",
          output: "Chunk ID: abc\nProcess running with session ID 42",
        },
      },
      {
        type: "response_item",
        payload: {
          type: "function_call",
          name: "write_stdin",
          call_id: "call_poll",
          arguments: JSON.stringify({ session_id: 42, chars: "" }),
        },
      },
      {
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call_poll",
          output: "Chunk ID: abc\nProcess exited with code 1\nOutput:\nvite build failed",
        },
      },
    ], 10_000);

    expect(analysis.commandIssueSamples[0]?.command).toBe("pnpm build");
    expect(analysis.topFailureType).toBe("build");
  });
});
