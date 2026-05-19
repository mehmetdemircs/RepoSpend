# Pricing

RepoSpend estimates API-equivalent cost from a local pricing table. The bundled defaults live in `packages/core/src/pricing.ts`, and the dashboard Settings page saves local overrides to `~/.repospend/pricing.json`.

The bundled table is seeded from public OpenAI and Anthropic API pricing pages and is expressed as USD per 1M tokens. Pricing changes over time, so treat RepoSpend costs as API-equivalent estimates rather than invoice-grade accounting.

Each model can define:

- input tokens
- cache write input tokens
- cached input tokens
- output tokens
- reasoning output tokens

If a model is not present in the pricing table, RepoSpend still displays token totals and marks cost as unknown. Unknown pricing does not stop scans, dashboard responses, CLI output, or exports.

If Codex only exposes a raw token total for an older session, RepoSpend also leaves cost unknown. It does not infer an input/output split because that would make the estimate look more precise than the local data supports.

Claude Code local transcripts may include token counts and model names, but they may also omit one or both depending on the local file and client version. RepoSpend leaves Claude cost unknown when the local data is insufficient instead of inventing a token split.

These costs are not your actual ChatGPT, Codex, Claude, or Claude Code bill. Your real cost may differ because of subscriptions, credits, provider terms, included usage, account-level pricing, or other billing factors.
