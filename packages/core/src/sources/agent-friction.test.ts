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
});
