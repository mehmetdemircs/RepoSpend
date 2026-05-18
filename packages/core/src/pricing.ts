import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NormalizedUsage, RepoSpendConfig } from "@repospend/types";

export interface ModelPricing {
  inputPerMillion: number;
  cachedInputPerMillion?: number;
  outputPerMillion: number;
  reasoningOutputPerMillion?: number;
  note?: string;
}

export type PricingTable = Record<string, ModelPricing>;

export const pricingInfo = {
  sourceName: "OpenAI API pricing",
  sourceUrl: "https://developers.openai.com/api/docs/pricing",
  unit: "USD per 1M tokens",
  updatedAt: "2026-05-18",
  note: "RepoSpend estimates API-equivalent cost from local token counts and public API-style Standard short-context pricing. This is not your actual ChatGPT/Codex bill; subscriptions, credits, provider terms, long-context pricing, regional processing, or other billing factors can make your real cost different.",
};

export const defaultPricing: PricingTable = {
  "gpt-5.5": { inputPerMillion: 5, cachedInputPerMillion: 0.5, outputPerMillion: 30, reasoningOutputPerMillion: 30 },
  "gpt-5.5-pro": { inputPerMillion: 30, outputPerMillion: 180, reasoningOutputPerMillion: 180 },
  "gpt-5.4": { inputPerMillion: 2.5, cachedInputPerMillion: 0.25, outputPerMillion: 15, reasoningOutputPerMillion: 15 },
  "gpt-5.4-mini": { inputPerMillion: 0.75, cachedInputPerMillion: 0.075, outputPerMillion: 4.5, reasoningOutputPerMillion: 4.5 },
  "gpt-5.4-nano": { inputPerMillion: 0.2, cachedInputPerMillion: 0.02, outputPerMillion: 1.25, reasoningOutputPerMillion: 1.25 },
  "gpt-5.4-pro": { inputPerMillion: 30, outputPerMillion: 180, reasoningOutputPerMillion: 180 },
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

export function calculateCostUsd(usage: Pick<NormalizedUsage, "model" | "inputTokens" | "cachedInputTokens" | "outputTokens" | "reasoningTokens">, pricing: PricingTable): number | undefined {
  if (!usage.model) {
    return undefined;
  }
  const modelPricing = pricing[usage.model] ?? pricing[usage.model.toLowerCase()];
  if (!modelPricing) {
    return undefined;
  }
  const billableInput = Math.max(usage.inputTokens - usage.cachedInputTokens, 0);
  const cachedRate = modelPricing.cachedInputPerMillion ?? modelPricing.inputPerMillion;
  const reasoningRate = modelPricing.reasoningOutputPerMillion ?? modelPricing.outputPerMillion;
  const cost =
    (billableInput / 1_000_000) * modelPricing.inputPerMillion +
    (usage.cachedInputTokens / 1_000_000) * cachedRate +
    (usage.outputTokens / 1_000_000) * modelPricing.outputPerMillion +
    (usage.reasoningTokens / 1_000_000) * reasoningRate;
  return Number(cost.toFixed(6));
}
