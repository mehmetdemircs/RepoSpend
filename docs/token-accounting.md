# Token Accounting

RepoSpend uses one normalized token shape across local clients:

- `inputTokens` is total input for the request/session. When a source reports cache reads or cache writes separately, RepoSpend includes them in `inputTokens` and also stores them in sub-buckets.
- `cachedInputTokens` is the cache-read portion of input.
- `cacheCreationInputTokens` is the cache-write portion of input, when the source exposes it.
- `cacheCreationInputTokens5m` and `cacheCreationInputTokens1h` preserve Anthropic's Claude cache-write TTL split when local transcripts expose `usage.cache_creation`.
- `cacheCreationInputTokens30m` and `cacheCreationInputTokens12h` preserve OpenAI's cache-write TTL split when usage records expose `cache_write_tokens_details` (flat or nested under `input_tokens_details`); `cacheCreationInputTokens` remains the total write bucket for billing.
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

## Claude Source Scope

RepoSpend scans both Claude project transcripts and Claude Desktop/local-agent
session roots:

```text
~/.claude/projects
~/.config/claude/projects
~/Library/Application Support/Claude/local-agent-mode-sessions
~/.config/Claude/local-agent-mode-sessions
```

Many terminal-first usage tools focus on `~/.claude/projects`. If local-agent
session files exist, RepoSpend can show higher Claude totals than `ccusage` or
Tokscale without a parser bug. When comparing tools, first check whether the
same Claude roots are included.

RepoSpend also preserves the cache-write TTL split when it is present
in local logs:

```text
5-minute cache write = cacheCreationInputTokens5m
1-hour cache write = cacheCreationInputTokens1h
30-minute cache write = cacheCreationInputTokens30m
12-hour cache write = cacheCreationInputTokens12h
unclassified cache write = cacheCreationInputTokens - (5m + 1h + 30m + 12h buckets)
```

OpenAI cache reads and writes may arrive as flat fields (`cached_input_tokens`,
`cache_write_tokens`) or nested (`input_tokens_details.cached_tokens`,
`input_tokens_details.cache_write_tokens` with
`cache_write_tokens_details.ttl_30m_tokens` / `ttl_12h_tokens`). Both shapes
normalize to the same buckets, and `inputTokens` stays inclusive of reads and
writes per the OpenAI API contract.

This is one reason RepoSpend API-equivalent cost can differ from `ccusage`.
Anthropic prices 5-minute cache writes at a different rate than 1-hour cache
writes. RepoSpend applies the recorded TTL-specific rate for each bucket; tools
that collapse all Claude cache creation tokens into a single cache-write column
can drift when a session mixes TTLs or when the chosen single rate does not match
the session's actual cache usage.

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

Codex sessions can switch models mid-session. Per-turn and direct usage records
each keep the model that was active for that request in the session's
`modelUsage` slices, so per-request pricing and model rollups stay correct
without creating duplicate session rows. Sessions that only expose cumulative
snapshots fall back to the session model and are priced as an aggregate with an
explicit assumption warning rather than invented per-request sizes.

For GitHub Copilot, RepoSpend aligns with ccusage and Tokscale for OTEL-backed
records, but keeps `cachedInputTokens` as a subset of `inputTokens` in the
normalized model. Copilot CLI session-state files can expose output tokens
without input/cache tokens; those sessions are counted as partial token data and
left unpriced until a full OTEL usage record is available.
