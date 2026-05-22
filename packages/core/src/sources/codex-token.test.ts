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
    expect(aggregation.tokenAggregationMethod).toBe("delta_sum");
    expect(aggregation.tokenConfidence).toBe("high");
  });

  it("sums per-turn last_token_usage instead of using max of total_token_usage", () => {
    const aggregation = aggregateTokens([
      lastAndTotal({ input: 100, cached: 20, output: 40, reasoning: 10, total: 150 }, { input: 100, cached: 20, output: 40, reasoning: 10, total: 150 }),
      lastAndTotal({ input: 80, cached: 50, output: 30, reasoning: 5, total: 115 }, { input: 180, cached: 70, output: 70, reasoning: 15, total: 265 }),
      // Compaction: total snapshot resets, last shows just this turn's billed tokens.
      lastAndTotal({ input: 90, cached: 10, output: 25, reasoning: 5, total: 120 }, { input: 90, cached: 10, output: 25, reasoning: 5, total: 120 }),
    ]);

    // Per-turn sums: input = 270, cached = 80, output = 95 (40+30+25), reasoning = 20 (10+5+5).
    expect(aggregation.inputTokens).toBe(270);
    expect(aggregation.cachedInputTokens).toBe(80);
    expect(aggregation.outputTokens).toBe(95);
    expect(aggregation.reasoningTokens).toBe(20);
    expect(aggregation.tokenAggregationMethod).toBe("delta_sum");
    expect(aggregation.tokenConfidence).toBe("high");
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

  it("skips duplicate last_token_usage rows when cumulative totals did not advance", () => {
    const aggregation = aggregateTokens([
      lastAndTotal({ input: 100, cached: 20, output: 40, reasoning: 10, total: 150 }, { input: 100, cached: 20, output: 40, reasoning: 10, total: 150 }),
      lastAndTotal({ input: 100, cached: 20, output: 40, reasoning: 10, total: 150 }, { input: 100, cached: 20, output: 40, reasoning: 10, total: 150 }),
      lastAndTotal({ input: 50, cached: 10, output: 20, reasoning: 5, total: 75 }, { input: 150, cached: 30, output: 60, reasoning: 15, total: 225 }),
    ]);

    expect(aggregation.inputTokens).toBe(150);
    expect(aggregation.cachedInputTokens).toBe(30);
    expect(aggregation.outputTokens).toBe(60);
    expect(aggregation.reasoningTokens).toBe(15);
    expect(aggregation.warnings).toContain("duplicate_or_stale_token_snapshots_skipped");
  });

  it("keeps post-compaction last_token_usage when cumulative totals reset hard", () => {
    const aggregation = aggregateTokens([
      lastAndTotal({ input: 100, cached: 20, output: 40, reasoning: 10, total: 150 }, { input: 1_000, cached: 900, output: 100, reasoning: 20, total: 1_120 }),
      lastAndTotal({ input: 30, cached: 5, output: 10, reasoning: 2, total: 42 }, { input: 30, cached: 5, output: 10, reasoning: 2, total: 42 }),
    ]);

    expect(aggregation.inputTokens).toBe(130);
    expect(aggregation.cachedInputTokens).toBe(25);
    expect(aggregation.outputTokens).toBe(50);
    expect(aggregation.reasoningTokens).toBe(12);
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

type UsageInput = { input: number; cached: number; output: number; reasoning: number; total: number };
function lastAndTotal(last: UsageInput, total: UsageInput) {
  const toBlock = (u: UsageInput) => ({
    input_tokens: u.input,
    cached_input_tokens: u.cached,
    output_tokens: u.output + u.reasoning,
    reasoning_output_tokens: u.reasoning,
    total_tokens: u.total,
  });
  return {
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        last_token_usage: toBlock(last),
        total_token_usage: toBlock(total),
      },
    },
  };
}
