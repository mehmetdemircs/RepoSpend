import { describe, expect, it } from "vitest";
import { aggregateTokens } from "./codex-token.js";

describe("Codex token normalization", () => {
  it("uses final cumulative snapshots instead of summing them", () => {
    const aggregation = aggregateTokens([
      tokenCount(100, 20, 40, 10, 150),
      tokenCount(200, 50, 80, 20, 300),
    ]);

    expect(aggregation.inputTokens).toBe(200);
    expect(aggregation.cachedInputTokens).toBe(50);
    expect(aggregation.outputTokens).toBe(60);
    expect(aggregation.reasoningTokens).toBe(20);
    expect(aggregation.totalTokens).toBe(300);
    expect(aggregation.tokenAggregationMethod).toBe("final_snapshot");
    expect(aggregation.tokenConfidence).toBe("high");
  });

  it("ignores direct usage when cumulative snapshots exist", () => {
    const aggregation = aggregateTokens([
      tokenCount(200, 50, 80, 20, 300),
      { usage: { input_tokens: 10_000, output_tokens: 10_000, total_tokens: 20_000 } },
    ]);

    expect(aggregation.totalTokens).toBe(300);
    expect(aggregation.warnings).toContain("token_direct_usage_ignored_after_cumulative_snapshot");
  });

  it("sums direct usage when there are no cumulative snapshots", () => {
    const aggregation = aggregateTokens([
      { usage: { input_tokens: 100, output_tokens: 30, total_tokens: 130 } },
      { usage: { input_tokens: 50, output_tokens: 20, total_tokens: 70 } },
    ]);

    expect(aggregation.inputTokens).toBe(150);
    expect(aggregation.outputTokens).toBe(50);
    expect(aggregation.totalTokens).toBe(200);
    expect(aggregation.tokenAggregationMethod).toBe("direct_usage");
    expect(aggregation.tokenConfidence).toBe("medium");
  });

  it("does not add cached input a second time when total tokens are absent", () => {
    const aggregation = aggregateTokens([
      { usage: { input_tokens: 100, cached_input_tokens: 25, output_tokens: 30 } },
      { usage: { input_tokens: 50, cached_input_tokens: 10, output_tokens: 20 } },
    ]);

    expect(aggregation.inputTokens).toBe(150);
    expect(aggregation.cachedInputTokens).toBe(35);
    expect(aggregation.outputTokens).toBe(50);
    expect(aggregation.totalTokens).toBe(200);
  });
});

function tokenCount(input: number, cached: number, outputWithReasoning: number, reasoning: number, total: number) {
  return {
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: {
          input_tokens: input,
          cached_input_tokens: cached,
          output_tokens: outputWithReasoning,
          reasoning_output_tokens: reasoning,
          total_tokens: total,
        },
      },
    },
  };
}
