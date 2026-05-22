# Pricing

RepoSpend estimates API-equivalent cost from a local pricing table. The bundled defaults live in `packages/core/src/pricing.ts`, and the dashboard Settings page saves local overrides to `~/.repospend/pricing.json`.

The bundled table is seeded from public OpenAI and Anthropic API pricing pages and is expressed as USD per 1M tokens. Pricing changes over time, so treat RepoSpend costs as API-equivalent estimates rather than invoice-grade accounting.

Each model can define:

- input tokens
- cache write input tokens
- cached input tokens
- output tokens
- reasoning output tokens

RepoSpend prices each bucket once. `inputTokens` is normalized as total input,
including cache reads and cache writes when those are present, so the pricing
formula first subtracts cache sub-buckets from billable input and then applies
their cache-specific rates. This is why RepoSpend token totals can be lower than
tools that add cache reads/writes as separate "total token" columns while still
producing comparable API-equivalent cost.

Reasoning output is also priced once. For Codex records where raw
`output_tokens` includes `reasoning_output_tokens`, RepoSpend subtracts reasoning
from visible output before storing and pricing both buckets. If a comparison tool
shows output inclusive of reasoning and also prices reasoning separately, its
cost will be higher because reasoning is counted twice.

See [token-accounting.md](token-accounting.md) for the detailed comparison model.

If a model is not present in the pricing table, RepoSpend still displays token totals and marks cost as unknown. Unknown pricing does not stop scans, dashboard responses, CLI output, or exports.

If Codex only exposes a raw token total for an older session, RepoSpend also leaves cost unknown. It does not infer an input/output split because that would make the estimate look more precise than the local data supports.

Claude Code local transcripts may include token counts and model names, but they may also omit one or both depending on the local file and client version. RepoSpend leaves Claude cost unknown when the local data is insufficient instead of inventing a token split.

These costs are not your actual ChatGPT, Codex, Claude, or Claude Code bill. Your real cost may differ because of subscriptions, credits, provider terms, included usage, account-level pricing, or other billing factors.
