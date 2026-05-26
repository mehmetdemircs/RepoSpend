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
    { label: "Claude pricing reference", url: "https://platform.claude.com/docs/en/about-claude/pricing" },
    { label: "GitHub Copilot model pricing reference", url: "https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing" },
  ],
  unit: "USD per 1M tokens",
  updatedAt: "2026-05-18",
  note: "RepoSpend estimates API-equivalent cost from local token counts and public API-style Standard pricing. This is not your actual bill; subscriptions, credits, provider terms, cache behavior, regional processing, or other billing factors can make your real cost different.",
};

export const defaultPricing: PricingTable = {
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
  "claude-opus-4-8": { inputPerMillion: 5, cacheCreationInputPerMillion: 6.25, cachedInputPerMillion: 0.5, outputPerMillion: 25 },
  "claude-opus-4-7": { inputPerMillion: 5, cacheCreationInputPerMillion: 6.25, cachedInputPerMillion: 0.5, outputPerMillion: 25 },
  "claude-opus-4-6": { inputPerMillion: 5, cacheCreationInputPerMillion: 6.25, cachedInputPerMillion: 0.5, outputPerMillion: 25 },
  "claude-opus-4-6-fast-mode": { inputPerMillion: 0, cacheCreationInputPerMillion: 0, cachedInputPerMillion: 0, outputPerMillion: 0, note: "GitHub Copilot supported model, but public per-token pricing is not listed separately. RepoSpend leaves API-equivalent pricing unset." },
  "claude-opus-4-5": { inputPerMillion: 5, cacheCreationInputPerMillion: 6.25, cachedInputPerMillion: 0.5, outputPerMillion: 25 },
  "claude-opus-4-1": { inputPerMillion: 15, cacheCreationInputPerMillion: 18.75, cachedInputPerMillion: 1.5, outputPerMillion: 75 },
  "claude-opus-4": { inputPerMillion: 15, cacheCreationInputPerMillion: 18.75, cachedInputPerMillion: 1.5, outputPerMillion: 75 },
  "claude-sonnet-4-6": { inputPerMillion: 3, cacheCreationInputPerMillion: 3.75, cachedInputPerMillion: 0.3, outputPerMillion: 15 },
  "claude-sonnet-4-5": { inputPerMillion: 3, cacheCreationInputPerMillion: 3.75, cachedInputPerMillion: 0.3, outputPerMillion: 15 },
  "claude-sonnet-4": { inputPerMillion: 3, cacheCreationInputPerMillion: 3.75, cachedInputPerMillion: 0.3, outputPerMillion: 15 },
  "claude-haiku-4-5": { inputPerMillion: 1, cacheCreationInputPerMillion: 1.25, cachedInputPerMillion: 0.1, outputPerMillion: 5 },
  "claude-3-5-haiku": { inputPerMillion: 0.8, cacheCreationInputPerMillion: 1, cachedInputPerMillion: 0.08, outputPerMillion: 4 },
};

export function loadPricingTable(pricingPath?: string): PricingTable {
  if (!pricingPath) {
    return defaultPricing;
  }

  try {
    const resolved = path.resolve(pricingPath);
    return { ...defaultPricing, ...(JSON.parse(fs.readFileSync(resolved, "utf8")) as PricingTable) };
  } catch {
    return defaultPricing;
  }
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

export function calculateCostUsd(usage: Pick<NormalizedUsage, "model" | "inputTokens" | "cachedInputTokens" | "cacheCreationInputTokens" | "outputTokens" | "reasoningTokens">, pricing: PricingTable): number | undefined {
  if (!usage.model) {
    return undefined;
  }
  const modelPricing = findModelPricing(usage.model, pricing);
  if (!modelPricing) {
    return undefined;
  }
  const cacheCreationInput = usage.cacheCreationInputTokens ?? 0;
  // Normalized inputTokens are total input tokens; cache reads/writes are split out so each can use its own rate.
  const billableInput = Math.max(usage.inputTokens - usage.cachedInputTokens - cacheCreationInput, 0);
  const cachedRate = modelPricing.cachedInputPerMillion ?? modelPricing.inputPerMillion;
  const cacheCreationRate = modelPricing.cacheCreationInputPerMillion ?? modelPricing.inputPerMillion;
  const reasoningRate = modelPricing.reasoningOutputPerMillion ?? modelPricing.outputPerMillion;
  const cost =
    (billableInput / 1_000_000) * modelPricing.inputPerMillion +
    (usage.cachedInputTokens / 1_000_000) * cachedRate +
    (cacheCreationInput / 1_000_000) * cacheCreationRate +
    (usage.outputTokens / 1_000_000) * modelPricing.outputPerMillion +
    (usage.reasoningTokens / 1_000_000) * reasoningRate;
  return Number(cost.toFixed(6));
}
