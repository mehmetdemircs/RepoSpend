import type { TokenAggregation, TokenAggregationMethod, TokenConfidence } from "@repospend/types";

interface CodexTokenAccumulator {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  tokenAggregationMethod: TokenAggregationMethod;
  tokenConfidence: TokenConfidence;
  tokenSnapshotCount: number;
  warnings: string[];
  cumulativeTokenSnapshots: ExtractedTokenUsage[];
  directTokenUsages: ExtractedTokenUsage[];
}

interface ExtractedTokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  cumulative: boolean;
}

export type CodexTokenRecord = unknown;

export type CodexTokenAggregation = Pick<
  TokenAggregation,
  | "inputTokens"
  | "cachedInputTokens"
  | "outputTokens"
  | "reasoningTokens"
  | "totalTokens"
  | "tokenAggregationMethod"
  | "tokenConfidence"
  | "tokenSnapshotCount"
  | "warnings"
>;

export function aggregateTokens(records: CodexTokenRecord[]): CodexTokenAggregation {
  const accumulator = emptyTokenAccumulator();
  for (const record of records) {
    collectRecordTokens(accumulator, record);
  }
  finalizeTokenAccumulator(accumulator);
  return {
    inputTokens: accumulator.inputTokens,
    cachedInputTokens: accumulator.cachedInputTokens,
    outputTokens: accumulator.outputTokens,
    reasoningTokens: accumulator.reasoningTokens,
    totalTokens: accumulator.totalTokens,
    tokenAggregationMethod: accumulator.tokenAggregationMethod,
    tokenConfidence: accumulator.tokenConfidence,
    tokenSnapshotCount: accumulator.tokenSnapshotCount,
    warnings: accumulator.warnings,
  };
}

function emptyTokenAccumulator(): CodexTokenAccumulator {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    tokenAggregationMethod: "unknown",
    tokenConfidence: "low",
    tokenSnapshotCount: 0,
    warnings: [],
    cumulativeTokenSnapshots: [],
    directTokenUsages: [],
  };
}

function collectRecordTokens(accumulator: CodexTokenAccumulator, record: unknown): void {
  const usage = extractRecordTokens(record);
  if (!usage) return;
  accumulator.tokenSnapshotCount += 1;
  if (usage.cumulative) {
    accumulator.cumulativeTokenSnapshots.push(usage);
  } else {
    accumulator.directTokenUsages.push(usage);
  }
}

function finalizeTokenAccumulator(accumulator: CodexTokenAccumulator): void {
  const invalidSnapshots = [...accumulator.cumulativeTokenSnapshots, ...accumulator.directTokenUsages].filter((usage) => !isValidTokenUsage(usage)).length;
  if (invalidSnapshots > 0) accumulator.warnings.push(`invalid_token_snapshots:${invalidSnapshots}`);
  const cumulative = accumulator.cumulativeTokenSnapshots.filter((snapshot) => isValidTokenUsage(snapshot));
  if (cumulative.length > 0) {
    const finalSnapshot = cumulative.reduce((best, snapshot) => (snapshot.totalTokens >= best.totalTokens ? snapshot : best), cumulative[0]!);
    applyFinalUsage(accumulator, finalSnapshot);
    accumulator.tokenAggregationMethod = "final_snapshot";
    accumulator.tokenConfidence = "high";
    if (accumulator.directTokenUsages.length > 0) accumulator.warnings.push("token_direct_usage_ignored_after_cumulative_snapshot");
    return;
  }

  const direct = accumulator.directTokenUsages.filter((usage) => isValidTokenUsage(usage));
  if (direct.length > 0) {
    const total = direct.reduce(
      (sum, usage) => ({
        inputTokens: sum.inputTokens + usage.inputTokens,
        cachedInputTokens: sum.cachedInputTokens + usage.cachedInputTokens,
        outputTokens: sum.outputTokens + usage.outputTokens,
        reasoningTokens: sum.reasoningTokens + usage.reasoningTokens,
        totalTokens: sum.totalTokens + usage.totalTokens,
      }),
      { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    );
    applyFinalUsage(accumulator, total);
    accumulator.tokenAggregationMethod = "delta_sum";
    accumulator.tokenConfidence = "high";
    return;
  }

  accumulator.tokenAggregationMethod = "unknown";
  accumulator.tokenConfidence = "low";
}

function extractRecordTokens(record: unknown): ExtractedTokenUsage | undefined {
  if (!record || typeof record !== "object") return undefined;
  const object = record as Record<string, unknown>;
  const payload = firstObject(object.payload);
  const payloadInfo = firstObject(payload?.info);

  // Prefer per-turn `last_token_usage`. Codex resets `total_token_usage` on
  // context compaction, so max-of-cumulative under-counts tokens billed before
  // each reset; summing per-turn deltas captures every billed API call.
  const codexLastUsage = firstObject(payloadInfo?.last_token_usage);
  if (codexLastUsage) {
    return tokenUsageFromObject(codexLastUsage, false);
  }

  const codexTotalUsage = firstObject(payloadInfo?.total_token_usage);
  if (codexTotalUsage) {
    return tokenUsageFromObject(codexTotalUsage, true);
  }

  const response = firstObject(object.response);
  const usage = firstObject(object.usage, object.token_usage, object.tokens, response?.usage, payload?.usage, payload?.token_usage, payload?.tokens);
  return tokenUsageFromObject(usage ?? object, false);
}

function tokenUsageFromObject(target: Record<string, unknown>, cumulative: boolean): ExtractedTokenUsage | undefined {
  const input = numberFromKeys(target, ["input_tokens", "inputTokens", "prompt_tokens", "promptTokens"]);
  const cached = numberFromKeys(target, ["cached_input_tokens", "cachedInputTokens", "cached_tokens", "cachedTokens", "cache_read_input_tokens"]);
  const outputWithReasoning = numberFromKeys(target, ["output_tokens", "outputTokens", "completion_tokens", "completionTokens"]);
  const reasoning = numberFromKeys(target, ["reasoning_tokens", "reasoningTokens", "reasoning_output_tokens", "reasoningOutputTokens"]);
  const output = Math.max(outputWithReasoning - reasoning, 0);
  const total = numberFromKeys(target, ["total_tokens", "totalTokens", "tokens_used", "tokensUsed"]);
  if (input + cached + output + reasoning + total === 0) return undefined;
  return {
    inputTokens: input,
    cachedInputTokens: cached,
    outputTokens: output,
    reasoningTokens: reasoning,
    totalTokens: total || input + output + reasoning,
    cumulative,
  };
}

function applyFinalUsage(accumulator: CodexTokenAccumulator, usage: Omit<ExtractedTokenUsage, "cumulative">): void {
  accumulator.inputTokens = usage.inputTokens;
  accumulator.cachedInputTokens = usage.cachedInputTokens;
  accumulator.outputTokens = usage.outputTokens;
  accumulator.reasoningTokens = usage.reasoningTokens;
  accumulator.totalTokens = usage.totalTokens || usage.inputTokens + usage.outputTokens + usage.reasoningTokens;
}

function isValidTokenUsage(usage: ExtractedTokenUsage): boolean {
  return usage.inputTokens >= 0 && usage.cachedInputTokens >= 0 && usage.outputTokens >= 0 && usage.reasoningTokens >= 0 && usage.totalTokens >= 0;
}

function firstObject(...values: unknown[]): Record<string, unknown> | undefined {
  return values.find((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value));
}

function numberFromKeys(object: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}
