import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isUsableModelPricing, normalizePricingModelId, resolvePricingForModel, type ModelPricing, type NormalizedUsage, type PricingContextRule, type PricingResolution, type RepoSpendConfig } from "@repospend/types";

export type { ModelPricing } from "@repospend/types";

export type PricingTable = Record<string, ModelPricing>;

export const pricingInfo = {
  sourceName: "Bundled API-equivalent model pricing",
  sourceUrl: "https://developers.openai.com/api/docs/pricing",
  sourceUrls: [
    { label: "OpenAI pricing reference", url: "https://developers.openai.com/api/docs/pricing" },
    { label: "OpenAI GPT-6 model reference", url: "https://developers.openai.com/api/docs/models" },
    { label: "OpenAI GPT-6.1 Sol reference", url: "https://developers.openai.com/api/docs/models/gpt-6.1-sol" },
    { label: "OpenAI GPT-6.1 Terra reference", url: "https://developers.openai.com/api/docs/models/gpt-6.1-terra" },
    { label: "OpenAI prompt caching guide", url: "https://developers.openai.com/api/docs/guides/prompt-caching" },
    { label: "OpenAI GPT-5.6 preview pricing", url: "https://openai.com/index/previewing-gpt-5-6-sol/" },
    { label: "OpenAI GPT-5.6 price update", url: "https://openai.com/index/advancing-the-price-performance-frontier-with-gpt-5-6/" },
    { label: "Claude pricing reference", url: "https://platform.claude.com/docs/en/about-claude/pricing" },
    { label: "Claude Haiku 5.5 and Sonnet cache update", url: "https://www.anthropic.com/claude-haiku-5-5" },
    { label: "Gemini 4 Argon pricing", url: "https://ai.google.dev/gemini-api/docs/latest-model?hl=en" },
    { label: "GitHub Copilot model pricing reference", url: "https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing" },
  ],
  unit: "USD per 1M tokens",
  updatedAt: "2026-10-27",
  note: "RepoSpend estimates API-equivalent cost from local token counts and public Standard pricing. Requests over each model's long-context threshold reprice per request when request sizes are recorded; aggregate-only usage assumes short-context rates and is flagged. Claude transcript fast-mode speeds use explicit published cards. Other processing modes, regional, and account-specific pricing can differ. This is not your actual bill.",
};

export const defaultPricing: PricingTable = {
  "gpt-6-astra": { inputPerMillion: 10, cachedInputPerMillion: 1, cacheCreationInputPerMillion: 12.5, cacheCreationInput30mPerMillion: 12.5, cacheCreationInput12hPerMillion: 25, outputPerMillion: 50, reasoningOutputPerMillion: 50 },
  "gpt-6-astra-long-context": { inputPerMillion: 20, cachedInputPerMillion: 2, cacheCreationInputPerMillion: 25, cacheCreationInput30mPerMillion: 25, cacheCreationInput12hPerMillion: 50, outputPerMillion: 75, reasoningOutputPerMillion: 75, note: "RepoSpend pricing card, not a provider model ID. Applied to the whole request when a single API call exceeds 272K input tokens: input and cache rates 2x, output 1.5x." },
  "gpt-6-sol": { inputPerMillion: 2, cachedInputPerMillion: 0.2, cacheCreationInputPerMillion: 2.5, cacheCreationInput30mPerMillion: 2.5, cacheCreationInput12hPerMillion: 5, outputPerMillion: 10, reasoningOutputPerMillion: 10 },
  "gpt-6-sol-long-context": { inputPerMillion: 4, cachedInputPerMillion: 0.4, cacheCreationInputPerMillion: 5, cacheCreationInput30mPerMillion: 5, cacheCreationInput12hPerMillion: 10, outputPerMillion: 15, reasoningOutputPerMillion: 15, note: "RepoSpend pricing card, not a provider model ID. Applied to the whole request when a single API call exceeds 272K input tokens: input and cache rates 2x, output 1.5x." },
  "gpt-6-luna": { inputPerMillion: 0.1, cachedInputPerMillion: 0.01, cacheCreationInputPerMillion: 0.125, cacheCreationInput30mPerMillion: 0.125, cacheCreationInput12hPerMillion: 0.25, outputPerMillion: 0.5, reasoningOutputPerMillion: 0.5 },
  "gpt-6-luna-long-context": { inputPerMillion: 0.2, cachedInputPerMillion: 0.02, cacheCreationInputPerMillion: 0.25, cacheCreationInput30mPerMillion: 0.25, cacheCreationInput12hPerMillion: 0.5, outputPerMillion: 0.75, reasoningOutputPerMillion: 0.75, note: "RepoSpend pricing card, not a provider model ID. Applied to the whole request when a single API call exceeds 272K input tokens: input and cache rates 2x, output 1.5x." },
  "gpt-6.1-sol": { inputPerMillion: 2, cachedInputPerMillion: 0.1, cacheCreationInputPerMillion: 2.5, cacheCreationInput30mPerMillion: 2.5, cacheCreationInput12hPerMillion: 5, outputPerMillion: 10, reasoningOutputPerMillion: 10 },
  "gpt-6.1-sol-long-context": { inputPerMillion: 4, cachedInputPerMillion: 0.2, cacheCreationInputPerMillion: 5, cacheCreationInput30mPerMillion: 5, cacheCreationInput12hPerMillion: 10, outputPerMillion: 15, reasoningOutputPerMillion: 15, note: "RepoSpend pricing card, not a provider model ID. Applied to the whole request when a single API call exceeds 272K input tokens: input and cache rates 2x, output 1.5x." },
  "gpt-6.1-terra": { inputPerMillion: 1, cachedInputPerMillion: 0.05, cacheCreationInputPerMillion: 1.25, cacheCreationInput30mPerMillion: 1.25, cacheCreationInput12hPerMillion: 2.5, outputPerMillion: 5, reasoningOutputPerMillion: 5, note: "GPT-6.1 Terra Standard short-context rates, released October 26, 2026. Cache writes are 1.25x input for 30-minute TTL and 2.5x for 12-hour TTL." },
  "gpt-6.1-terra-long-context": { inputPerMillion: 2, cachedInputPerMillion: 0.1, cacheCreationInputPerMillion: 2.5, cacheCreationInput30mPerMillion: 2.5, cacheCreationInput12hPerMillion: 5, outputPerMillion: 7.5, reasoningOutputPerMillion: 7.5, note: "RepoSpend pricing card, not a provider model ID. Applied to the whole request when a single API call exceeds 272K input tokens: input and cache rates 2x, output 1.5x." },
  "gpt-5.6": { inputPerMillion: 4, cachedInputPerMillion: 0.4, cacheCreationInputPerMillion: 5, cacheCreationInput30mPerMillion: 5, cacheCreationInput12hPerMillion: 10, outputPerMillion: 20, reasoningOutputPerMillion: 20, note: "GPT-5.6 aliases Sol. Promotional Standard short-context rates are available at least through November 21, 2026: $4 input / $20 output, $0.40 cache reads, and $5 cache writes per 1M tokens." },
  "gpt-5.6-sol": { inputPerMillion: 4, cachedInputPerMillion: 0.4, cacheCreationInputPerMillion: 5, cacheCreationInput30mPerMillion: 5, cacheCreationInput12hPerMillion: 10, outputPerMillion: 20, reasoningOutputPerMillion: 20, note: "Promotional Standard short-context rates available at least through November 21, 2026." },
  "gpt-5.6-terra": { inputPerMillion: 2, cachedInputPerMillion: 0.2, cacheCreationInputPerMillion: 2.5, cacheCreationInput30mPerMillion: 2.5, cacheCreationInput12hPerMillion: 5, outputPerMillion: 12, reasoningOutputPerMillion: 12, note: "GPT-5.6 Terra reduced API pricing effective July 30, 2026. Cache reads are 90% below input and cache writes are 1.25x input." },
  "gpt-5.6-luna": { inputPerMillion: 0.2, cachedInputPerMillion: 0.02, cacheCreationInputPerMillion: 0.25, cacheCreationInput30mPerMillion: 0.25, cacheCreationInput12hPerMillion: 0.5, outputPerMillion: 1.2, reasoningOutputPerMillion: 1.2, note: "GPT-5.6 Luna reduced API pricing effective July 30, 2026. Cache reads are 90% below input and cache writes are 1.25x input." },
  "gpt-5.5": { inputPerMillion: 5, cachedInputPerMillion: 0.5, outputPerMillion: 30, reasoningOutputPerMillion: 30 },
  "gpt-5.5-pro": { inputPerMillion: 30, outputPerMillion: 180, reasoningOutputPerMillion: 180 },
  "gpt-5.4": { inputPerMillion: 2.5, cachedInputPerMillion: 0.25, outputPerMillion: 15, reasoningOutputPerMillion: 15 },
  "gpt-5.4-mini": { inputPerMillion: 0.75, cachedInputPerMillion: 0.075, outputPerMillion: 4.5, reasoningOutputPerMillion: 4.5 },
  "gpt-5.4-nano": { inputPerMillion: 0.2, cachedInputPerMillion: 0.02, outputPerMillion: 1.25, reasoningOutputPerMillion: 1.25 },
  "gpt-5.4-pro": { inputPerMillion: 30, outputPerMillion: 180, reasoningOutputPerMillion: 180 },
  "gpt-5.6-sol-long-context": { inputPerMillion: 8, cachedInputPerMillion: 0.8, cacheCreationInputPerMillion: 10, cacheCreationInput30mPerMillion: 10, cacheCreationInput12hPerMillion: 20, outputPerMillion: 30, reasoningOutputPerMillion: 30, note: "RepoSpend pricing card, not a provider model ID. Applied to the whole GPT-5.6 request when a single API call exceeds 272K input tokens: input and cache rates 2x, output 1.5x." },
  "gpt-5.6-terra-long-context": { inputPerMillion: 4, cachedInputPerMillion: 0.4, cacheCreationInputPerMillion: 5, cacheCreationInput30mPerMillion: 5, cacheCreationInput12hPerMillion: 10, outputPerMillion: 18, reasoningOutputPerMillion: 18, note: "RepoSpend pricing card, not a provider model ID. Applied to the whole GPT-5.6 Terra request when a single API call exceeds 272K input tokens: input and cache rates 2x, output 1.5x." },
  "gpt-5.6-luna-long-context": { inputPerMillion: 0.4, cachedInputPerMillion: 0.04, cacheCreationInputPerMillion: 0.5, cacheCreationInput30mPerMillion: 0.5, cacheCreationInput12hPerMillion: 1, outputPerMillion: 1.8, reasoningOutputPerMillion: 1.8, note: "RepoSpend pricing card, not a provider model ID. Applied to the whole GPT-5.6 Luna request when a single API call exceeds 272K input tokens: input and cache rates 2x, output 1.5x." },
  "gpt-5.5-long-context": { inputPerMillion: 10, cachedInputPerMillion: 1, outputPerMillion: 45, reasoningOutputPerMillion: 45, note: "RepoSpend pricing card, not a provider model ID. Applied to the whole GPT-5.5 request when a single API call exceeds 272K input tokens. No published cache-write rates." },
  "gpt-5.5-pro-long-context": { inputPerMillion: 60, outputPerMillion: 270, reasoningOutputPerMillion: 270, note: "RepoSpend pricing card, not a provider model ID. Applied to the whole GPT-5.5 Pro request when a single API call exceeds 272K input tokens. No published cache rates." },
  "gpt-5.4-long-context": { inputPerMillion: 5, cachedInputPerMillion: 0.5, outputPerMillion: 22.5, reasoningOutputPerMillion: 22.5, note: "RepoSpend pricing card, not a provider model ID. Applied to the whole GPT-5.4 request when a single API call exceeds 272K input tokens. No published cache-write rates." },
  "gpt-5.4-pro-long-context": { inputPerMillion: 60, outputPerMillion: 270, reasoningOutputPerMillion: 270, note: "RepoSpend pricing card, not a provider model ID. Applied to the whole GPT-5.4 Pro request when a single API call exceeds 272K input tokens. No published cache rates." },
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
  "gemini-3.6-flash": { inputPerMillion: 0.75, cachedInputPerMillion: 0.075, outputPerMillion: 3.75, note: "GitHub Copilot promotional rates through December 31, 2026; API-equivalent estimate." },
  "gemini-3.7-flash": { inputPerMillion: 0.75, cachedInputPerMillion: 0.075, outputPerMillion: 3.75, note: "GitHub Copilot promotional rates through December 31, 2026; API-equivalent estimate." },
  "gemini-3.8-flash": { inputPerMillion: 0.75, cachedInputPerMillion: 0.075, outputPerMillion: 3.75, note: "GitHub Copilot promotional rates through December 31, 2026; API-equivalent estimate." },
  "gemini-4-argon": { inputPerMillion: 2, cachedInputPerMillion: 0.1, outputPerMillion: 10, reasoningOutputPerMillion: 10, note: "Introductory rates through November 30, 2026. From December 1: $4 input / $0.20 cached input / $20 output (including thinking) per 1M tokens. No explicit cache-write charge. Bundled prices are a dated snapshot, not an automatic future rate switch." },
  "grok-4.5": { inputPerMillion: 2, cachedInputPerMillion: 0.5, outputPerMillion: 6, note: "GitHub Copilot Standard rates up to 200K input tokens; longer requests use different rates." },
  "grok-4.6": { inputPerMillion: 2, cachedInputPerMillion: 0.5, outputPerMillion: 6, note: "GitHub Copilot Standard rates up to 200K input tokens; longer requests use different rates." },
  "grok-4.7": { inputPerMillion: 2, cachedInputPerMillion: 0.5, outputPerMillion: 6, note: "GitHub Copilot Standard rates up to 200K input tokens; longer requests use different rates." },
  "mai-code-1.1-flash": { inputPerMillion: 0.2, cachedInputPerMillion: 0.02, outputPerMillion: 1.2, note: "GitHub Copilot Microsoft model; API-equivalent estimate." },
  "kimi-k3": { inputPerMillion: 3, cachedInputPerMillion: 0.3, outputPerMillion: 15, note: "GitHub Copilot Moonshot AI model; API-equivalent estimate." },
  "raptor-mini": { inputPerMillion: 0.25, cachedInputPerMillion: 0.025, outputPerMillion: 2, note: "GitHub Copilot fine-tuned model using GPT-5 mini pricing." },
  "oswe-vscode-prime": { inputPerMillion: 0.25, cachedInputPerMillion: 0.025, outputPerMillion: 2, note: "GitHub Copilot Raptor mini internal model id." },
  "lark": { inputPerMillion: 0.25, cachedInputPerMillion: 0.025, outputPerMillion: 2, note: "GitHub Copilot preview model; estimated with lightweight Copilot pricing." },
  "goldeneye": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10, note: "GitHub Copilot fine-tuned model using GPT-5.1-Codex pricing." },
  "mai-code-1-flash": { inputPerMillion: 0.75, cachedInputPerMillion: 0.075, outputPerMillion: 4.5, note: "GitHub Copilot supported Microsoft model; API-equivalent estimate, not a Copilot bill." },
  "kimi-k2.7-code": { inputPerMillion: 0.95, cachedInputPerMillion: 0.19, outputPerMillion: 4, note: "GitHub Copilot supported Moonshot AI model; API-equivalent estimate, not a Copilot bill." },
  "claude-fable-5": { inputPerMillion: 10, cacheCreationInput5mPerMillion: 12.5, cacheCreationInput1hPerMillion: 20, cacheCreationInputPerMillion: 20, cachedInputPerMillion: 1, outputPerMillion: 50 },
  "claude-fable-5-1": { inputPerMillion: 10, cacheCreationInput5mPerMillion: 12.5, cacheCreationInput1hPerMillion: 20, cacheCreationInputPerMillion: 20, cachedInputPerMillion: 0.25, outputPerMillion: 50 },
  "claude-mythos-5": { inputPerMillion: 10, cacheCreationInput5mPerMillion: 12.5, cacheCreationInput1hPerMillion: 20, cacheCreationInputPerMillion: 20, cachedInputPerMillion: 1, outputPerMillion: 50, note: "Limited availability Anthropic model; same public API-equivalent pricing as Claude Fable 5." },
  "claude-mythos-5-1": { inputPerMillion: 10, cacheCreationInput5mPerMillion: 12.5, cacheCreationInput1hPerMillion: 20, cacheCreationInputPerMillion: 20, cachedInputPerMillion: 0.25, outputPerMillion: 50, note: "Limited availability Anthropic model; same public API-equivalent pricing as Claude Fable 5.1." },
  "claude-opus-5-5-fast-mode": { inputPerMillion: 8, cacheCreationInput5mPerMillion: 10.0, cacheCreationInput1hPerMillion: 16, cacheCreationInputPerMillion: 16, cachedInputPerMillion: 0.4, outputPerMillion: 40, note: "Anthropic first-party fast mode rates; cache multipliers apply." },
  "claude-opus-5-5": { inputPerMillion: 4, cacheCreationInput5mPerMillion: 5, cacheCreationInput1hPerMillion: 8, cacheCreationInputPerMillion: 8, cachedInputPerMillion: 0.2, outputPerMillion: 20 },
  "claude-opus-5-fast-mode": { inputPerMillion: 10, cacheCreationInput5mPerMillion: 12.5, cacheCreationInput1hPerMillion: 20, cacheCreationInputPerMillion: 20, cachedInputPerMillion: 1, outputPerMillion: 50, note: "Anthropic first-party fast mode rates; cache multipliers apply." },
  "claude-opus-5": { inputPerMillion: 5, cacheCreationInput5mPerMillion: 6.25, cacheCreationInput1hPerMillion: 10, cacheCreationInputPerMillion: 10, cachedInputPerMillion: 0.5, outputPerMillion: 25 },
  "claude-opus-4-8": { inputPerMillion: 5, cacheCreationInput5mPerMillion: 6.25, cacheCreationInput1hPerMillion: 10, cacheCreationInputPerMillion: 10, cachedInputPerMillion: 0.5, outputPerMillion: 25 },
  "claude-opus-4-8-fast-mode": { inputPerMillion: 10, cacheCreationInput5mPerMillion: 12.5, cacheCreationInput1hPerMillion: 20, cacheCreationInputPerMillion: 12.5, cachedInputPerMillion: 1, outputPerMillion: 50, note: "Claude Opus 4.8 fast mode research preview pricing. Prompt caching multipliers apply on top of fast mode pricing." },
  "claude-opus-4-7": { inputPerMillion: 5, cacheCreationInput5mPerMillion: 6.25, cacheCreationInput1hPerMillion: 10, cacheCreationInputPerMillion: 10, cachedInputPerMillion: 0.5, outputPerMillion: 25 },
  "claude-opus-4-6": { inputPerMillion: 5, cacheCreationInput5mPerMillion: 6.25, cacheCreationInput1hPerMillion: 10, cacheCreationInputPerMillion: 10, cachedInputPerMillion: 0.5, outputPerMillion: 25 },
  "claude-opus-4-6-fast-mode": { inputPerMillion: 0, cacheCreationInput5mPerMillion: 0, cacheCreationInput1hPerMillion: 0, cacheCreationInputPerMillion: 0, cachedInputPerMillion: 0, outputPerMillion: 0, note: "GitHub Copilot supported model, but public per-token pricing is not listed separately. RepoSpend leaves API-equivalent pricing unset." },
  "claude-opus-4-5": { inputPerMillion: 5, cacheCreationInput5mPerMillion: 6.25, cacheCreationInput1hPerMillion: 10, cacheCreationInputPerMillion: 10, cachedInputPerMillion: 0.5, outputPerMillion: 25 },
  "claude-opus-4-1": { inputPerMillion: 15, cacheCreationInput5mPerMillion: 18.75, cacheCreationInput1hPerMillion: 30, cacheCreationInputPerMillion: 30, cachedInputPerMillion: 1.5, outputPerMillion: 75 },
  "claude-opus-4": { inputPerMillion: 15, cacheCreationInput5mPerMillion: 18.75, cacheCreationInput1hPerMillion: 30, cacheCreationInputPerMillion: 30, cachedInputPerMillion: 1.5, outputPerMillion: 75 },
  "claude-sonnet-5-5": { inputPerMillion: 2, cacheCreationInput5mPerMillion: 2.5, cacheCreationInput1hPerMillion: 4, cacheCreationInputPerMillion: 4, cachedInputPerMillion: 0.1, outputPerMillion: 10 },
  "claude-sonnet-5": { inputPerMillion: 2, cacheCreationInput5mPerMillion: 2.5, cacheCreationInput1hPerMillion: 4, cacheCreationInputPerMillion: 4, cachedInputPerMillion: 0.2, outputPerMillion: 10, note: "Anthropic made the $2 input / $10 output introductory pricing permanent on August 10, 2026." },
  "claude-sonnet-4-6": { inputPerMillion: 3, cacheCreationInput5mPerMillion: 3.75, cacheCreationInput1hPerMillion: 6, cacheCreationInputPerMillion: 6, cachedInputPerMillion: 0.3, outputPerMillion: 15 },
  "claude-sonnet-4-5": { inputPerMillion: 3, cacheCreationInput5mPerMillion: 3.75, cacheCreationInput1hPerMillion: 6, cacheCreationInputPerMillion: 6, cachedInputPerMillion: 0.3, outputPerMillion: 15 },
  "claude-sonnet-4": { inputPerMillion: 3, cacheCreationInput5mPerMillion: 3.75, cacheCreationInput1hPerMillion: 6, cacheCreationInputPerMillion: 6, cachedInputPerMillion: 0.3, outputPerMillion: 15 },
  "claude-haiku-4-5": { inputPerMillion: 1, cacheCreationInput5mPerMillion: 1.25, cacheCreationInput1hPerMillion: 2, cacheCreationInputPerMillion: 2, cachedInputPerMillion: 0.1, outputPerMillion: 5 },
  "claude-haiku-5-5": { inputPerMillion: 0.1, cacheCreationInput5mPerMillion: 0.125, cacheCreationInput1hPerMillion: 0.2, cacheCreationInputPerMillion: 0.2, cachedInputPerMillion: 0.01, outputPerMillion: 0.5, note: "Prompts up to 100,000 input tokens per request, including cache reads and writes. Larger prompts use the separately editable claude-haiku-5-5-long-context card. Aggregate-only usage stays unpriced when request lengths are unknown." },
  "claude-haiku-5-5-long-context": { inputPerMillion: 0.5, cacheCreationInput5mPerMillion: 0.625, cacheCreationInput1hPerMillion: 1, cacheCreationInputPerMillion: 1, cachedInputPerMillion: 0.05, outputPerMillion: 2.5, note: "RepoSpend pricing card, not a provider model ID. Applied to the whole Haiku 5.5 request when total prompt length exceeds 100,000 tokens." },
  "claude-3-5-haiku": { inputPerMillion: 0.8, cacheCreationInput5mPerMillion: 1, cacheCreationInput1hPerMillion: 1.6, cacheCreationInputPerMillion: 1.6, cachedInputPerMillion: 0.08, outputPerMillion: 4 },
};

const legacyBundledPricing: PricingTable = {
  "claude-sonnet-5-5": { inputPerMillion: 2, cacheCreationInput5mPerMillion: 2.5, cacheCreationInput1hPerMillion: 4, cacheCreationInputPerMillion: 4, cachedInputPerMillion: 0.2, outputPerMillion: 10 },
  "gpt-5.6": { inputPerMillion: 5, cachedInputPerMillion: 0.5, cacheCreationInputPerMillion: 6.25, outputPerMillion: 30, reasoningOutputPerMillion: 30, note: "GPT-5.6 Sol flagship tier. OpenAI preview pricing lists Sol at $5 input / $30 output per 1M tokens, cache writes at 1.25x input, and cache reads at a 90% discount." },
  "gpt-5.6-sol": { inputPerMillion: 5, cachedInputPerMillion: 0.5, cacheCreationInputPerMillion: 6.25, outputPerMillion: 30, reasoningOutputPerMillion: 30 },
  "gpt-5.6-terra": { inputPerMillion: 2.5, cachedInputPerMillion: 0.25, cacheCreationInputPerMillion: 3.125, outputPerMillion: 15, reasoningOutputPerMillion: 15 },
  "gpt-5.6-luna": { inputPerMillion: 1, cachedInputPerMillion: 0.1, cacheCreationInputPerMillion: 1.25, outputPerMillion: 6, reasoningOutputPerMillion: 6 },
  "claude-sonnet-5": { inputPerMillion: 2, cacheCreationInput5mPerMillion: 2.5, cacheCreationInput1hPerMillion: 4, cacheCreationInputPerMillion: 4, cachedInputPerMillion: 0.2, outputPerMillion: 10, note: "Anthropic introductory pricing through August 31, 2026. Standard pricing from September 1, 2026 is $3 input / $15 output per 1M tokens." },
};

// Frozen model IDs from the 0.1.3 full-table settings file. Do not derive these from
// defaultPricing, since each new release can add rows that the saved file lacks.
const legacyFullTableModelIds = [
  "gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.5-pro",
  "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.4-pro", "gpt-5.3-codex", "gpt-5.3-codex-spark",
  "gpt-5.2", "gpt-5.2-chat-latest", "gpt-5.2-codex", "gpt-5.2-pro", "gpt-5.1", "gpt-5.1-chat-latest",
  "gpt-5.1-codex", "gpt-5.1-codex-max", "gpt-5", "gpt-5-chat-latest", "gpt-5-codex", "gpt-5-pro",
  "gpt-5-mini", "gpt-5-nano", "gpt-4.1", "gemini-2.5-pro", "gemini-3-flash", "gemini-3.1-pro",
  "gemini-3.5-flash", "raptor-mini", "oswe-vscode-prime", "lark", "goldeneye", "mai-code-1-flash",
  "kimi-k2.7-code", "claude-fable-5", "claude-mythos-5", "claude-opus-4-8", "claude-opus-4-8-fast-mode",
  "claude-opus-4-7", "claude-opus-4-6", "claude-opus-4-6-fast-mode", "claude-opus-4-5", "claude-opus-4-1",
  "claude-opus-4", "claude-sonnet-5", "claude-sonnet-4-6", "claude-sonnet-4-5", "claude-sonnet-4",
  "claude-haiku-4-5", "claude-3-5-haiku",
] as const;

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
  const isLegacyFullTable = legacyFullTableModelIds.every((model) => Object.hasOwn(stored, model));
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

type CostUsage = Pick<NormalizedUsage, "model" | "inputTokens" | "cachedInputTokens" | "cacheCreationInputTokens" | "cacheCreationInputTokens5m" | "cacheCreationInputTokens1h" | "cacheCreationInputTokens30m" | "cacheCreationInputTokens12h" | "outputTokens" | "reasoningTokens">;

export function calculateCostUsd(usage: CostUsage, pricing: PricingTable, requestInputTokens?: number): number | undefined {
  const cost = unroundedCostUsd(usage, pricing, requestInputTokens);
  return cost === undefined ? undefined : Number((cost + Number.EPSILON).toFixed(6));
}

export function calculateRequestCostsUsd(requests: Array<CostUsage & { requestInputTokens?: number | undefined }>, pricing: PricingTable): number | undefined {
  return calculateRequestCosts(requests, pricing).costUsd;
}

export function calculateRequestCosts(requests: Array<CostUsage & { requestInputTokens?: number | undefined }>, pricing: PricingTable): { costUsd: number | undefined; requestCosts: Array<number | undefined>; warnings: string[]; assumptions: string[] } {
  const resolutions = new Map<string, PricingResolution>();
  const warnings = new Set<string>();
  const assumptions = new Set<string>();
  let total = 0;
  const requestCosts = requests.map((request) => {
    let resolution = request.model ? resolutions.get(request.model) : undefined;
    if (request.model && !resolution) {
      resolution = resolvePricingForModel(request.model, pricing);
      resolutions.set(request.model, resolution);
    }
    const context = requestContextPricing(request, pricing, resolution);
    if (context.assumption) assumptions.add(context.assumption);
    const cost = context.pricing === undefined ? undefined : costFromModelPricing(request, context.pricing);
    if (cost !== undefined) total += cost;
    else if (request.model && resolution) {
      warnings.add(context.unknownContext ? "unknown_request_context" : `unknown_pricing_model:${normalizePricingModelId(request.model)}`);
    } else warnings.add("unknown_pricing");
    return cost;
  });
  return {
    costUsd: requests.length && !warnings.size ? Number((total + Number.EPSILON).toFixed(6)) : undefined,
    requestCosts,
    warnings: [...warnings],
    assumptions: [...assumptions],
  };
}

interface RequestContextRule {
  /** Resolved pricing card id the rule applies to (sourceModel). */
  baseModel: string;
  /** Request input above this size reprices the whole request at the long-context card. */
  thresholdInputTokens: number;
  longContextModel: string;
  /** unknown-size requests: "unpriced" flags unknown_request_context; "short-context" prices base rates with an assumption note. */
  unknownRequestSize: "unpriced" | "short-context";
  /** missing long-context card in a saved table: "unpriced" leaves the request unpriced; "base" prices base rates with an assumption note. */
  missingLongContextCard: "unpriced" | "base";
  /** Models matching this pattern that inherited an older card also follow the rule (e.g. haiku 5.5 snapshots on saved tables missing the 5.5 card). */
  inheritedModelPattern?: RegExp;
  /** When true, a canonical card the user intentionally re-priced stays flat above the threshold instead of silently swapping to the bundled long-context card. */
  canonicalFlatOverride?: boolean;
}

const REQUEST_CONTEXT_RULES: RequestContextRule[] = [
  { baseModel: "claude-haiku-5-5", thresholdInputTokens: 100_000, longContextModel: "claude-haiku-5-5-long-context", unknownRequestSize: "unpriced", missingLongContextCard: "unpriced", inheritedModelPattern: /^claude-haiku-5-5(?:$|[-.@[])/ },
  { baseModel: "gpt-6-astra", thresholdInputTokens: 272_000, longContextModel: "gpt-6-astra-long-context", unknownRequestSize: "short-context", missingLongContextCard: "base", canonicalFlatOverride: true },
  { baseModel: "gpt-6-sol", thresholdInputTokens: 272_000, longContextModel: "gpt-6-sol-long-context", unknownRequestSize: "short-context", missingLongContextCard: "base", canonicalFlatOverride: true },
  { baseModel: "gpt-6-luna", thresholdInputTokens: 272_000, longContextModel: "gpt-6-luna-long-context", unknownRequestSize: "short-context", missingLongContextCard: "base", canonicalFlatOverride: true },
  { baseModel: "gpt-6.1-sol", thresholdInputTokens: 272_000, longContextModel: "gpt-6.1-sol-long-context", unknownRequestSize: "short-context", missingLongContextCard: "base", canonicalFlatOverride: true },
  { baseModel: "gpt-6.1-terra", thresholdInputTokens: 272_000, longContextModel: "gpt-6.1-terra-long-context", unknownRequestSize: "short-context", missingLongContextCard: "base", canonicalFlatOverride: true },
  // GPT-5.x Standard cards carry the same >272K tiers; mini/nano have no published tier.
  { baseModel: "gpt-5.6", thresholdInputTokens: 272_000, longContextModel: "gpt-5.6-sol-long-context", unknownRequestSize: "short-context", missingLongContextCard: "base", canonicalFlatOverride: true },
  { baseModel: "gpt-5.6-sol", thresholdInputTokens: 272_000, longContextModel: "gpt-5.6-sol-long-context", unknownRequestSize: "short-context", missingLongContextCard: "base", canonicalFlatOverride: true },
  { baseModel: "gpt-5.6-terra", thresholdInputTokens: 272_000, longContextModel: "gpt-5.6-terra-long-context", unknownRequestSize: "short-context", missingLongContextCard: "base", canonicalFlatOverride: true },
  { baseModel: "gpt-5.6-luna", thresholdInputTokens: 272_000, longContextModel: "gpt-5.6-luna-long-context", unknownRequestSize: "short-context", missingLongContextCard: "base", canonicalFlatOverride: true },
  { baseModel: "gpt-5.5", thresholdInputTokens: 272_000, longContextModel: "gpt-5.5-long-context", unknownRequestSize: "short-context", missingLongContextCard: "base", canonicalFlatOverride: true },
  { baseModel: "gpt-5.5-pro", thresholdInputTokens: 272_000, longContextModel: "gpt-5.5-pro-long-context", unknownRequestSize: "short-context", missingLongContextCard: "base", canonicalFlatOverride: true },
  { baseModel: "gpt-5.4", thresholdInputTokens: 272_000, longContextModel: "gpt-5.4-long-context", unknownRequestSize: "short-context", missingLongContextCard: "base", canonicalFlatOverride: true },
  { baseModel: "gpt-5.4-pro", thresholdInputTokens: 272_000, longContextModel: "gpt-5.4-pro-long-context", unknownRequestSize: "short-context", missingLongContextCard: "base", canonicalFlatOverride: true },
];

/** Serialized copy of the request-context registry for API consumers (Settings labels). */
export function pricingContextRules(): PricingContextRule[] {
  return REQUEST_CONTEXT_RULES.map(({ baseModel, longContextModel, thresholdInputTokens }) => ({ baseModel, longContextModel, thresholdInputTokens }));
}

interface RequestContextOutcome {
  pricing: ModelPricing | undefined;
  /** True when a tiered model needed the request size and it was missing. */
  unknownContext: boolean;
  /** Informational assumption worth surfacing without blocking the price. */
  assumption?: string;
}

function requestContextPricing(request: CostUsage & { requestInputTokens?: number | undefined }, pricing: PricingTable, resolution: PricingResolution | undefined): RequestContextOutcome {
  if (!request.model || !resolution) return { pricing: undefined, unknownContext: false };
  const normalizedModel = normalizePricingModelId(request.model);
  const rule = REQUEST_CONTEXT_RULES.find((candidate) => candidate.baseModel === resolution.sourceModel
    || (resolution.inherited && candidate.inheritedModelPattern?.test(normalizedModel)));
  if (!rule) return { pricing: resolution.pricing, unknownContext: false };
  // When the rule matched through the inherited-model pattern the model resolved to an
  // older-generation card; use the rule's own base row (no inheritance) so an invalid
  // or absent base card stays unpriced rather than silently billing a different generation.
  const baseRow = pricing[rule.baseModel];
  const basePricing = resolution.sourceModel === rule.baseModel
    ? resolution.pricing
    : isUsableModelPricing(baseRow) ? baseRow : undefined;
  const requestInputTokens = request.requestInputTokens;
  if (requestInputTokens === undefined || !Number.isFinite(requestInputTokens) || requestInputTokens < 0) {
    return rule.unknownRequestSize === "unpriced"
      ? { pricing: undefined, unknownContext: true }
      : { pricing: basePricing, unknownContext: false, assumption: `assumed_short_context_rates:${rule.baseModel}` };
  }
  if (requestInputTokens <= rule.thresholdInputTokens) return { pricing: basePricing, unknownContext: false };
  // A canonical card the user intentionally re-priced is a flat override: keep it at
  // long-context sizes instead of silently swapping in the bundled tier card. This is a
  // GPT-only policy — Haiku's base/long cards stay separately editable at every size.
  // Alias forms (dated snapshots, compact dates, provider prefixes) resolve to the same
  // canonical row, so the policy follows resolution.sourceModel rather than the literal
  // request id. A custom `-long-context` row of their own still opts back into tiered pricing.
  const bundledBase = defaultPricing[rule.baseModel];
  if (
    rule.canonicalFlatOverride &&
    resolution.sourceModel === rule.baseModel &&
    bundledBase &&
    basePricing &&
    !pricingEntriesEqual(basePricing, bundledBase) &&
    pricingEntriesEqual(pricing[rule.longContextModel], defaultPricing[rule.longContextModel])
  ) {
    return { pricing: basePricing, unknownContext: false };
  }
  const longContext = resolvePricingForModel(rule.longContextModel, pricing);
  if (isUsableModelPricing(longContext.pricing)) return { pricing: longContext.pricing, unknownContext: false };
  return rule.missingLongContextCard === "unpriced"
    ? { pricing: undefined, unknownContext: false }
    : { pricing: basePricing, unknownContext: false, assumption: `missing_long_context_pricing:${rule.baseModel}` };
}

function unroundedCostUsd(usage: CostUsage, pricing: PricingTable, requestInputTokens?: number): number | undefined {
  if (!usage.model) {
    return undefined;
  }
  const resolution = resolvePricingForModel(usage.model, pricing);
  const modelPricing = requestContextPricing({ ...usage, requestInputTokens }, pricing, resolution).pricing;
  return costFromModelPricing(usage, modelPricing);
}

function costFromModelPricing(usage: CostUsage, modelPricing: ModelPricing | undefined): number | undefined {
  if (!usage.model || !isUsableModelPricing(modelPricing)) {
    return undefined;
  }
  const cacheCreationInput5m = usage.cacheCreationInputTokens5m ?? 0;
  const cacheCreationInput1h = usage.cacheCreationInputTokens1h ?? 0;
  const cacheCreationInput30m = usage.cacheCreationInputTokens30m ?? 0;
  const cacheCreationInput12h = usage.cacheCreationInputTokens12h ?? 0;
  const splitCacheCreationInput = cacheCreationInput5m + cacheCreationInput1h + cacheCreationInput30m + cacheCreationInput12h;
  const cacheCreationInput = usage.cacheCreationInputTokens ?? splitCacheCreationInput;
  const unclassifiedCacheCreationInput = Math.max(cacheCreationInput - splitCacheCreationInput, 0);
  // Normalized inputTokens are total input tokens; cache reads/writes are split out so each can use its own rate.
  const billableInput = Math.max(usage.inputTokens - usage.cachedInputTokens - cacheCreationInput, 0);
  const cachedRate = modelPricing.cachedInputPerMillion ?? modelPricing.inputPerMillion;
  const cacheCreationRate = firstPositiveRate(modelPricing.cacheCreationInputPerMillion, modelPricing.cacheCreationInput1hPerMillion, modelPricing.cacheCreationInput5mPerMillion, modelPricing.inputPerMillion);
  const cacheCreation5mRate = firstPositiveRate(modelPricing.cacheCreationInput5mPerMillion, modelPricing.cacheCreationInputPerMillion, modelPricing.inputPerMillion);
  const cacheCreation1hRate = firstPositiveRate(modelPricing.cacheCreationInput1hPerMillion, modelPricing.cacheCreationInputPerMillion, modelPricing.inputPerMillion);
  const cacheCreation30mRate = firstPositiveRate(modelPricing.cacheCreationInput30mPerMillion, modelPricing.cacheCreationInputPerMillion, modelPricing.inputPerMillion);
  const cacheCreation12hRate = firstPositiveRate(modelPricing.cacheCreationInput12hPerMillion, modelPricing.cacheCreationInputPerMillion, modelPricing.inputPerMillion);
  const reasoningRate = modelPricing.reasoningOutputPerMillion ?? modelPricing.outputPerMillion;
  const cost =
    (billableInput / 1_000_000) * modelPricing.inputPerMillion +
    (usage.cachedInputTokens / 1_000_000) * cachedRate +
    (cacheCreationInput5m / 1_000_000) * cacheCreation5mRate +
    (cacheCreationInput1h / 1_000_000) * cacheCreation1hRate +
    (cacheCreationInput30m / 1_000_000) * cacheCreation30mRate +
    (cacheCreationInput12h / 1_000_000) * cacheCreation12hRate +
    (unclassifiedCacheCreationInput / 1_000_000) * cacheCreationRate +
    (usage.outputTokens / 1_000_000) * modelPricing.outputPerMillion +
    (usage.reasoningTokens / 1_000_000) * reasoningRate;
  return cost;
}

function firstPositiveRate(...rates: Array<number | undefined>): number {
  return rates.find((rate) => typeof rate === "number" && Number.isFinite(rate) && rate > 0) ?? 0;
}
