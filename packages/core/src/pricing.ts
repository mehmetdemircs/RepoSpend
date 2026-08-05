import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findModelPricing, type ModelPricing, type NormalizedUsage, type RepoSpendConfig } from "@repospend/types";

export type { ModelPricing } from "@repospend/types";

export type PricingTable = Record<string, ModelPricing>;

export const pricingInfo = {
  sourceName: "Bundled API-equivalent model pricing",
  sourceUrl: "https://developers.openai.com/api/docs/pricing",
  sourceUrls: [
    { label: "OpenAI pricing reference", url: "https://developers.openai.com/api/docs/pricing" },
    { label: "OpenAI GPT-5.6 preview pricing", url: "https://openai.com/index/previewing-gpt-5-6-sol/" },
    { label: "OpenAI GPT-5.6 price update", url: "https://openai.com/index/advancing-the-price-performance-frontier-with-gpt-5-6/" },
    { label: "Claude pricing reference", url: "https://platform.claude.com/docs/en/about-claude/pricing" },
    { label: "GitHub Copilot model pricing reference", url: "https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing" },
  ],
  unit: "USD per 1M tokens",
  updatedAt: "2026-07-30",
  note: "RepoSpend estimates API-equivalent cost from local token counts and public API-style Standard pricing. GPT-5.6 Terra and Luna use the reduced OpenAI API rates effective July 30, 2026. This is not your actual bill; subscriptions, credits, provider terms, cache behavior, regional processing, or other billing factors can make your real cost different.",
};

export const defaultPricing: PricingTable = {
  "gpt-5.6": { inputPerMillion: 5, cachedInputPerMillion: 0.5, cacheCreationInputPerMillion: 6.25, outputPerMillion: 30, reasoningOutputPerMillion: 30, note: "GPT-5.6 Sol flagship tier. OpenAI preview pricing lists Sol at $5 input / $30 output per 1M tokens, cache writes at 1.25x input, and cache reads at a 90% discount." },
  "gpt-5.6-sol": { inputPerMillion: 5, cachedInputPerMillion: 0.5, cacheCreationInputPerMillion: 6.25, outputPerMillion: 30, reasoningOutputPerMillion: 30 },
  "gpt-5.6-terra": { inputPerMillion: 2, cachedInputPerMillion: 0.2, cacheCreationInputPerMillion: 2.5, outputPerMillion: 12, reasoningOutputPerMillion: 12, note: "GPT-5.6 Terra reduced API pricing effective July 30, 2026. Cache reads are 90% below input and cache writes are 1.25x input." },
  "gpt-5.6-luna": { inputPerMillion: 0.2, cachedInputPerMillion: 0.02, cacheCreationInputPerMillion: 0.25, outputPerMillion: 1.2, reasoningOutputPerMillion: 1.2, note: "GPT-5.6 Luna reduced API pricing effective July 30, 2026. Cache reads are 90% below input and cache writes are 1.25x input." },
  "gpt-5.5": { inputPerMillion: 5, cachedInputPerMillion: 0.5, outputPerMillion: 30, reasoningOutputPerMillion: 30 },
  "gpt-5.5-pro": { inputPerMillion: 30, outputPerMillion: 180, reasoningOutputPerMillion: 180 },
  "gpt-5.4": { inputPerMillion: 2.5, cachedInputPerMillion: 0.25, outputPerMillion: 15, reasoningOutputPerMillion: 15 },
  "gpt-5.4-mini": { inputPerMillion: 0.75, cachedInputPerMillion: 0.075, outputPerMillion: 4.5, reasoningOutputPerMillion: 4.5 },
  "gpt-5.4-nano": { inputPerMillion: 0.2, cachedInputPerMillion: 0.02, outputPerMillion: 1.25, reasoningOutputPerMillion: 1.25 },
  "gpt-5.4-pro": { inputPerMillion: 30, outputPerMillion: 180, reasoningOutputPerMillion: 180 },
  "gpt-5.3-codex": { inputPerMillion: 1.75, cachedInputPerMillion: 0.175, outputPerMillion: 14, reasoningOutputPerMillion: 14 },
  "gpt-5.3-codex-spark": { inputPerMillion: 1.75, cachedInputPerMillion: 0.175, outputPerMillion: 14, reasoningOutputPerMillion: 14, note: "Research preview pricing is not final in the OpenAI Codex rate card; this API-equivalent rate matches the practical ccusage/LiteLLM-style estimate." },
  "gpt-5.2": { inputPerMillion: 1.75, cachedInputPerMillion: 0.175, outputPerMillion: 14, reasoningOutputPerMillion: 14 },
  "gpt-5.2-chat-latest": { inputPerMillion: 1.75, cachedInputPerMillion: 0.175, outputPerMillion: 14, reasoningOutputPerMillion: 14 },
  "gpt-5.2-codex": { inputPerMillion: 1.75, cachedInputPerMillion: 0.175, outputPerMillion: 14, reasoningOutputPerMillion: 14 },
  "gpt-5.2-pro": { inputPerMillion: 21, outputPerMillion: 168, reasoningOutputPerMillion: 168 },
  "gpt-5.1": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10, reasoningOutputPerMillion: 10 },
  "gpt-5.1-chat-latest": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10, reasoningOutputPerMillion: 10 },
  "gpt-5.1-codex": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10, reasoningOutputPerMillion: 10 },
  "gpt-5.1-codex-max": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10, reasoningOutputPerMillion: 10 },
  "gpt-5": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10, reasoningOutputPerMillion: 10 },
  "gpt-5-chat-latest": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10, reasoningOutputPerMillion: 10 },
  "gpt-5-codex": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10, reasoningOutputPerMillion: 10 },
  "gpt-5-pro": { inputPerMillion: 15, outputPerMillion: 120, reasoningOutputPerMillion: 120 },
  "gpt-5-mini": { inputPerMillion: 0.25, cachedInputPerMillion: 0.025, outputPerMillion: 2, reasoningOutputPerMillion: 2 },
  "gpt-5-nano": { inputPerMillion: 0.05, cachedInputPerMillion: 0.005, outputPerMillion: 0.4, reasoningOutputPerMillion: 0.4 },
  "gpt-4.1": { inputPerMillion: 2, cachedInputPerMillion: 0.5, outputPerMillion: 8 },
  "gemini-2.5-pro": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10, note: "GitHub Copilot supported Google-hosted model; API-equivalent estimate, not a Copilot bill." },
  "gemini-3-flash": { inputPerMillion: 0.5, cachedInputPerMillion: 0.05, outputPerMillion: 3, note: "GitHub Copilot supported Google-hosted model; API-equivalent estimate, not a Copilot bill." },
  "gemini-3.1-pro": { inputPerMillion: 2, cachedInputPerMillion: 0.2, outputPerMillion: 12, note: "GitHub Copilot supported Google-hosted model; API-equivalent estimate, not a Copilot bill." },
  "gemini-3.5-flash": { inputPerMillion: 1.5, cachedInputPerMillion: 0.15, outputPerMillion: 9, note: "GitHub Copilot supported Google-hosted model; API-equivalent estimate, not a Copilot bill." },
  "raptor-mini": { inputPerMillion: 0.25, cachedInputPerMillion: 0.025, outputPerMillion: 2, note: "GitHub Copilot fine-tuned model using GPT-5 mini pricing." },
  "oswe-vscode-prime": { inputPerMillion: 0.25, cachedInputPerMillion: 0.025, outputPerMillion: 2, note: "GitHub Copilot Raptor mini internal model id." },
  "lark": { inputPerMillion: 0.25, cachedInputPerMillion: 0.025, outputPerMillion: 2, note: "GitHub Copilot preview model; estimated with lightweight Copilot pricing." },
  "goldeneye": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10, note: "GitHub Copilot fine-tuned model using GPT-5.1-Codex pricing." },
  "mai-code-1-flash": { inputPerMillion: 0.75, cachedInputPerMillion: 0.075, outputPerMillion: 4.5, note: "GitHub Copilot supported Microsoft model; API-equivalent estimate, not a Copilot bill." },
  "kimi-k2.7-code": { inputPerMillion: 0.95, cachedInputPerMillion: 0.19, outputPerMillion: 4, note: "GitHub Copilot supported Moonshot AI model; API-equivalent estimate, not a Copilot bill." },
  "claude-fable-5": { inputPerMillion: 10, cacheCreationInput5mPerMillion: 12.5, cacheCreationInput1hPerMillion: 20, cacheCreationInputPerMillion: 20, cachedInputPerMillion: 1, outputPerMillion: 50 },
  "claude-mythos-5": { inputPerMillion: 10, cacheCreationInput5mPerMillion: 12.5, cacheCreationInput1hPerMillion: 20, cacheCreationInputPerMillion: 20, cachedInputPerMillion: 1, outputPerMillion: 50, note: "Limited availability Anthropic model; same public API-equivalent pricing as Claude Fable 5." },
  "claude-opus-4-8": { inputPerMillion: 5, cacheCreationInput5mPerMillion: 6.25, cacheCreationInput1hPerMillion: 10, cacheCreationInputPerMillion: 10, cachedInputPerMillion: 0.5, outputPerMillion: 25 },
  "claude-opus-4-8-fast-mode": { inputPerMillion: 10, cacheCreationInput5mPerMillion: 12.5, cacheCreationInput1hPerMillion: 20, cacheCreationInputPerMillion: 12.5, cachedInputPerMillion: 1, outputPerMillion: 50, note: "Claude Opus 4.8 fast mode research preview pricing. Prompt caching multipliers apply on top of fast mode pricing." },
  "claude-opus-4-7": { inputPerMillion: 5, cacheCreationInput5mPerMillion: 6.25, cacheCreationInput1hPerMillion: 10, cacheCreationInputPerMillion: 10, cachedInputPerMillion: 0.5, outputPerMillion: 25 },
  "claude-opus-4-6": { inputPerMillion: 5, cacheCreationInput5mPerMillion: 6.25, cacheCreationInput1hPerMillion: 10, cacheCreationInputPerMillion: 10, cachedInputPerMillion: 0.5, outputPerMillion: 25 },
  "claude-opus-4-6-fast-mode": { inputPerMillion: 0, cacheCreationInput5mPerMillion: 0, cacheCreationInput1hPerMillion: 0, cacheCreationInputPerMillion: 0, cachedInputPerMillion: 0, outputPerMillion: 0, note: "GitHub Copilot supported model, but public per-token pricing is not listed separately. RepoSpend leaves API-equivalent pricing unset." },
  "claude-opus-4-5": { inputPerMillion: 5, cacheCreationInput5mPerMillion: 6.25, cacheCreationInput1hPerMillion: 10, cacheCreationInputPerMillion: 10, cachedInputPerMillion: 0.5, outputPerMillion: 25 },
  "claude-opus-4-1": { inputPerMillion: 15, cacheCreationInput5mPerMillion: 18.75, cacheCreationInput1hPerMillion: 30, cacheCreationInputPerMillion: 30, cachedInputPerMillion: 1.5, outputPerMillion: 75 },
  "claude-opus-4": { inputPerMillion: 15, cacheCreationInput5mPerMillion: 18.75, cacheCreationInput1hPerMillion: 30, cacheCreationInputPerMillion: 30, cachedInputPerMillion: 1.5, outputPerMillion: 75 },
  "claude-sonnet-5": { inputPerMillion: 2, cacheCreationInput5mPerMillion: 2.5, cacheCreationInput1hPerMillion: 4, cacheCreationInputPerMillion: 4, cachedInputPerMillion: 0.2, outputPerMillion: 10, note: "Anthropic introductory pricing through August 31, 2026. Standard pricing from September 1, 2026 is $3 input / $15 output per 1M tokens." },
  "claude-sonnet-4-6": { inputPerMillion: 3, cacheCreationInput5mPerMillion: 3.75, cacheCreationInput1hPerMillion: 6, cacheCreationInputPerMillion: 6, cachedInputPerMillion: 0.3, outputPerMillion: 15 },
  "claude-sonnet-4-5": { inputPerMillion: 3, cacheCreationInput5mPerMillion: 3.75, cacheCreationInput1hPerMillion: 6, cacheCreationInputPerMillion: 6, cachedInputPerMillion: 0.3, outputPerMillion: 15 },
  "claude-sonnet-4": { inputPerMillion: 3, cacheCreationInput5mPerMillion: 3.75, cacheCreationInput1hPerMillion: 6, cacheCreationInputPerMillion: 6, cachedInputPerMillion: 0.3, outputPerMillion: 15 },
  "claude-haiku-4-5": { inputPerMillion: 1, cacheCreationInput5mPerMillion: 1.25, cacheCreationInput1hPerMillion: 2, cacheCreationInputPerMillion: 2, cachedInputPerMillion: 0.1, outputPerMillion: 5 },
  "claude-3-5-haiku": { inputPerMillion: 0.8, cacheCreationInput5mPerMillion: 1, cacheCreationInput1hPerMillion: 1.6, cacheCreationInputPerMillion: 1.6, cachedInputPerMillion: 0.08, outputPerMillion: 4 },
};

const legacyBundledPricing: PricingTable = {
  "gpt-5.6-terra": { inputPerMillion: 2.5, cachedInputPerMillion: 0.25, cacheCreationInputPerMillion: 3.125, outputPerMillion: 15, reasoningOutputPerMillion: 15 },
  "gpt-5.6-luna": { inputPerMillion: 1, cachedInputPerMillion: 0.1, cacheCreationInputPerMillion: 1.25, outputPerMillion: 6, reasoningOutputPerMillion: 6 },
};

export function loadPricingTable(pricingPath?: string): PricingTable {
  if (!pricingPath) {
    return defaultPricing;
  }

  try {
    const resolved = path.resolve(pricingPath);
    const stored = JSON.parse(fs.readFileSync(resolved, "utf8")) as PricingTable;
    return { ...defaultPricing, ...migrateLegacyBundledPricing(stored) };
  } catch {
    return defaultPricing;
  }
}

export function pricingOverrides(pricing: PricingTable): PricingTable {
  return Object.fromEntries(
    Object.entries(pricing).filter(([model, modelPricing]) => {
      const bundled = defaultPricing[model];
      return !bundled || !pricingEntriesEqual(modelPricing, bundled);
    }),
  );
}

function migrateLegacyBundledPricing(stored: PricingTable): PricingTable {
  const isLegacyFullTable = Object.keys(defaultPricing).every((model) => Object.hasOwn(stored, model));
  if (!isLegacyFullTable) return stored;

  const migrated = { ...stored };
  for (const [model, legacyPricing] of Object.entries(legacyBundledPricing)) {
    if (pricingEntriesEqual(migrated[model], legacyPricing)) delete migrated[model];
  }
  return pricingOverrides(migrated);
}

function pricingEntriesEqual(left: ModelPricing | undefined, right: ModelPricing | undefined): boolean {
  if (!left || !right) return left === right;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key as keyof ModelPricing] === right[key as keyof ModelPricing]);
}

export function resolvePricingPath(config: RepoSpendConfig = {}): string {
  return config.pricingPath ? path.resolve(repospendHome(), config.pricingPath) : path.join(repospendHome(), "pricing.json");
}

export function savePricingTable(pricingPath: string, pricing: PricingTable): void {
  fs.mkdirSync(path.dirname(pricingPath), { recursive: true });
  fs.writeFileSync(pricingPath, `${JSON.stringify(pricing, null, 2)}\n`);
}

export function repospendHome(): string {
  return process.env.REPOSPEND_HOME || path.join(os.homedir(), ".repospend");
}

export function calculateCostUsd(usage: Pick<NormalizedUsage, "model" | "inputTokens" | "cachedInputTokens" | "cacheCreationInputTokens" | "cacheCreationInputTokens5m" | "cacheCreationInputTokens1h" | "outputTokens" | "reasoningTokens">, pricing: PricingTable): number | undefined {
  if (!usage.model) {
    return undefined;
  }
  const modelPricing = findModelPricing(usage.model, pricing);
  if (!modelPricing) {
    return undefined;
  }
  const cacheCreationInput5m = usage.cacheCreationInputTokens5m ?? 0;
  const cacheCreationInput1h = usage.cacheCreationInputTokens1h ?? 0;
  const splitCacheCreationInput = cacheCreationInput5m + cacheCreationInput1h;
  const cacheCreationInput = usage.cacheCreationInputTokens ?? splitCacheCreationInput;
  const unclassifiedCacheCreationInput = Math.max(cacheCreationInput - splitCacheCreationInput, 0);
  // Normalized inputTokens are total input tokens; cache reads/writes are split out so each can use its own rate.
  const billableInput = Math.max(usage.inputTokens - usage.cachedInputTokens - cacheCreationInput, 0);
  const cachedRate = modelPricing.cachedInputPerMillion ?? modelPricing.inputPerMillion;
  const cacheCreationRate = firstPositiveRate(modelPricing.cacheCreationInputPerMillion, modelPricing.cacheCreationInput1hPerMillion, modelPricing.cacheCreationInput5mPerMillion, modelPricing.inputPerMillion);
  const cacheCreation5mRate = firstPositiveRate(modelPricing.cacheCreationInput5mPerMillion, modelPricing.cacheCreationInputPerMillion, modelPricing.inputPerMillion);
  const cacheCreation1hRate = firstPositiveRate(modelPricing.cacheCreationInput1hPerMillion, modelPricing.cacheCreationInputPerMillion, modelPricing.inputPerMillion);
  const reasoningRate = modelPricing.reasoningOutputPerMillion ?? modelPricing.outputPerMillion;
  const cost =
    (billableInput / 1_000_000) * modelPricing.inputPerMillion +
    (usage.cachedInputTokens / 1_000_000) * cachedRate +
    (cacheCreationInput5m / 1_000_000) * cacheCreation5mRate +
    (cacheCreationInput1h / 1_000_000) * cacheCreation1hRate +
    (unclassifiedCacheCreationInput / 1_000_000) * cacheCreationRate +
    (usage.outputTokens / 1_000_000) * modelPricing.outputPerMillion +
    (usage.reasoningTokens / 1_000_000) * reasoningRate;
  return Number(cost.toFixed(6));
}

function firstPositiveRate(...rates: Array<number | undefined>): number {
  return rates.find((rate) => typeof rate === "number" && Number.isFinite(rate) && rate > 0) ?? 0;
}
