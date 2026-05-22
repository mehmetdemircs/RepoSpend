# Token Accounting

RepoSpend uses one normalized token shape across local clients:

- `inputTokens` is total input for the request/session. When a source reports cache reads or cache writes separately, RepoSpend includes them in `inputTokens` and also stores them in sub-buckets.
- `cachedInputTokens` is the cache-read portion of input.
- `cacheCreationInputTokens` is the cache-write portion of input, when the source exposes it.
- `outputTokens` is visible/non-reasoning output.
- `reasoningTokens` is reasoning output, when the source exposes it.
- `totalTokens = inputTokens + outputTokens + reasoningTokens`.

This keeps total tokens aligned with the amount of model work represented by the normalized session, while still preserving the billable cache buckets needed for cost.

## Why `ccusage` Can Show Higher Totals

`ccusage` displays cache reads and cache writes as addable token buckets. In that accounting style, a total is closer to:

```text
uncached input + cache read input + cache write input + output
```

RepoSpend instead normalizes those cache buckets under input:

```text
inputTokens + outputTokens + reasoningTokens
```

Both views can be useful, but they answer different questions. RepoSpend's total is the dashboard/product total: how much local AI coding usage belongs to a repo, session, model, or day without counting the same cached input twice. `ccusage`'s displayed total is useful as a billable-line-item view, but it will look larger when cache reuse is high.

Do not make RepoSpend's total match `ccusage` by adding `cachedInputTokens` to `inputTokens`. RepoSpend already prices cached input separately in `packages/core/src/pricing.ts`:

```text
billable input = inputTokens - cachedInputTokens - cacheCreationInputTokens
cached input = cachedInputTokens
cache write input = cacheCreationInputTokens
```

Adding cached tokens again would inflate token totals and double-charge cached input in API-equivalent cost.

## Reasoning Tokens

RepoSpend keeps reasoning tokens separate when the local source exposes them. The accurate treatment depends on the source's raw usage shape:

- If `output_tokens` already includes `reasoning_output_tokens`, RepoSpend subtracts reasoning from output and then stores reasoning separately.
- If a source reports visible output and reasoning as separate non-overlapping fields, RepoSpend can store both directly.
- If a source does not expose reasoning, RepoSpend leaves reasoning at zero rather than inventing it.

Codex local token records currently need the first treatment: reported `output_tokens` can include `reasoning_output_tokens`. RepoSpend therefore normalizes Codex output to visible output and prices reasoning once. A comparison tool that reports output inclusive of reasoning and also reports reasoning separately can show a higher cost because reasoning has effectively been counted twice.

## What To Compare In Reviews

When checking RepoSpend against `ccusage`, Tokscale, or another local usage tool:

- Compare the same absolute date window and timezone.
- Compare API-equivalent cost first.
- Compare bucket-level values, not just headline total tokens.
- Treat large cost differences as real discrepancies.
- Treat token total differences as suspicious only after accounting for cache semantics, reasoning semantics, date filters, and cumulative Codex checkpoints.

For Codex, RepoSpend prefers per-turn `last_token_usage` deltas and skips stale duplicate snapshots when available. This avoids under-counting sessions that compacted and avoids over-counting rebroadcast cumulative checkpoints.
