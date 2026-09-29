# Pricing

RepoSpend estimates API-equivalent cost from a local pricing table. The bundled defaults live in `packages/core/src/pricing.ts`, and the dashboard Settings page saves local overrides to `~/.repospend/pricing.json`.

The bundled table is seeded from public OpenAI, Anthropic, Google, and GitHub Copilot model references and is expressed as USD per 1M tokens. Pricing changes over time, so treat RepoSpend costs as API-equivalent estimates rather than invoice-grade accounting.

The GPT-6.1 Sol card was checked on September 29, 2026; other bundled defaults were checked on September 28, 2026. Defaults use published Standard API prices. Claude Sonnet 5.5 has explicit $2 input / $10 output rates with the same cache rates as Sonnet 5. Claude Sonnet 5 remains at $2 input and $10 output per 1M tokens because Anthropic made its introductory rate permanent on August 10, 2026.

GPT-6 Astra, Sol, and Luna use OpenAI's Standard short-context rates. Their long-context requests above 272,000 input tokens use different rates, and local session totals do not identify every request's pricing tier. Fast, batch, and regional processing can also differ from these defaults. RepoSpend keeps the result labeled as an API-equivalent estimate.

### GPT-6.1 Sol (September 29, 2026)

The explicit `gpt-6.1-sol` card uses $2 input, $0.10 cached input, $2.50 cache writes, and $10 output/reasoning per 1M tokens, verified against [OpenAI's model reference](https://developers.openai.com/api/docs/models/gpt-6.1-sol) on September 29. GPT-6 Sol remains separate at $0.20 for cached input. Case-insensitive and Copilot-prefixed IDs resolve to the same card; terminal snapshot dates preserve the model generation. Snapshot support is defensive parsing, not a claim that OpenAI publishes those snapshot IDs. Custom exact-ID overrides continue to take precedence.

Above 272K input tokens per request, GPT-6.1 Sol's Standard rates become $4 input, $0.20 cached input, $5 cache writes, and $15 output per 1M tokens. Fast costs twice Standard; Batch and Flex cost half Standard. RepoSpend's default estimate uses Standard short-context pricing because aggregate local usage cannot reliably identify these modifiers for every request. See the [GPT-6.1 Sol pricing and Codex tracking guide](https://repospend.com/guides/gpt-6-1-sol-pricing) for a worked example.

Claude Fable 5.1 and Mythos 5.1 retain their predecessor's base rates but have lower cache-read pricing. Claude Opus 5.5 has its own lower base and cache rates. These model rows use Anthropic's global Standard rates.

OpenAI reduced GPT-5.6 pricing effective July 30, 2026. RepoSpend uses $2 input and $12 output per 1M tokens for Terra, and $0.20 input and $1.20 output for Luna. Cached input remains 90% below the uncached input rate, and cache writes are billed at 1.25x the uncached input rate, so Luna's bundled cache-write rate is $0.25 per 1M tokens.

GPT-5.6 Sol and its `gpt-5.6` alias use promotional $4 input, $0.40 cached input, $5 cache writes, and $20 output/reasoning per 1M tokens, available at least through November 21, 2026. Older full bundled pricing files receive this correction; intentionally saved sparse overrides remain unchanged.

Gemini 3.6, 3.7, and 3.8 Flash use GitHub Copilot promotional rates through December 31, 2026. MAI-Code-1.1-Flash, Grok 4.5–4.7, and Kimi K3 have explicit Copilot reference cards. Grok rates use the up-to-200K input tier; longer requests cost more.

Claude transcript `usage.speed: "fast"` selects a fast-mode card per model and speed bucket, preserving accurate estimates for mixed-speed sessions. Opus 5.5 uses $8 input / $40 output, and Opus 5 uses $10 / $50; caching multipliers apply. Unknown fast cards remain unpriced with a visible warning. [Anthropic's current pricing documentation](https://platform.claude.com/docs/en/about-claude/pricing) states that Opus 4.6 ignores fast speed and uses Standard pricing. Regional and account modifiers are not applied.

The Settings page persists only custom or intentionally edited model rows. This lets future bundled rate updates flow through automatically. Older full pricing files are migrated for the GPT-5.6 Terra and Luna reductions when they still contain the previous bundled rates.

Some GitHub Copilot model rows are hosted or fine-tuned vendor models such as Raptor mini, MAI-Code-1-Flash, and Kimi K2.7 Code. RepoSpend prices those rows from GitHub's public per-token table as API-equivalent estimates, not as a Copilot invoice.

For Claude models, RepoSpend uses Anthropic's cache-write TTL split when local
Claude Code usage reports expose it. Tokens recorded under
`cache_creation.ephemeral_5m_input_tokens` use the 5-minute cache-write rate, and
tokens recorded under `cache_creation.ephemeral_1h_input_tokens` use the 1-hour
cache-write rate. If a source only exposes the older aggregate
`cache_creation_input_tokens` field, RepoSpend falls back to the model's generic
cache-write rate.

Each model can define:

- input tokens
- 5-minute cache write input tokens
- 1-hour cache write input tokens
- generic cache write input tokens for sources without a TTL split
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

This is a known reason RepoSpend Codex API-equivalent cost can be lower than a
tool whose output bucket remains inclusive of reasoning while also exposing a
separate reasoning bucket. Compare visible output and reasoning separately before
treating a cost delta as a pricing-table problem.

See [token-accounting.md](token-accounting.md) for the detailed comparison model.

This can differ from tools or older `ccusage` versions that price all Claude
cache creation tokens with one cache-write rate. A single-rate calculation can
understate sessions that mostly used Anthropic's 1-hour cache writes or overstate
sessions that mostly used 5-minute cache writes. RepoSpend prices the buckets
recorded in the local Claude transcript instead of forcing every cache write into
one column.

When an exact model id is not present in the pricing table, RepoSpend first tries the closest older version in the same model tier, then conservative family matching for known provider naming patterns. For example, a nearby newer Claude Opus 4.x or GPT 5.x variant can inherit the closest older bundled rate so the dashboard stays useful while public rate cards catch up. Inherited rates are labeled in Settings.

If RepoSpend cannot resolve a usable rate, it still displays token totals and marks cost as unknown. Unknown pricing does not stop scans, dashboard responses, CLI output, or exports.

If Codex only exposes a raw token total for an older session, RepoSpend also leaves cost unknown. It does not infer an input/output split because that would make the estimate look more precise than the local data supports.

Claude Code local transcripts may include token counts and model names, but they may also omit one or both depending on the local file and client version. RepoSpend leaves Claude cost unknown when the local data is insufficient instead of inventing a token split.

GitHub Copilot local files vary by surface. OTEL exports can include full token
splits and can be priced with the bundled model table. Copilot CLI session-state
files can expose output-token counts without input/cache fields; RepoSpend shows
those output tokens but leaves API-equivalent cost unknown because pricing only
the output side would look more complete than the local data supports.

These costs are not your actual ChatGPT, Codex, Claude, Claude Code, or GitHub Copilot bill. Your real cost may differ because of subscriptions, credits, provider terms, included usage, premium request multipliers, account-level pricing, or other billing factors.
