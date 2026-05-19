# RepoSpend — Agent Guide

RepoSpend is a local-first dashboard that shows which Git repositories are consuming the most AI coding tokens. It reads local Codex and Claude Code files read-only, groups sessions by repo, and surfaces tokens, cost estimates, models, sessions, and agent friction. No login. No telemetry. No prompt uploads.

For product context, domain terms, and UX principles, read `CONTEXT.md` first.

This file intentionally mirrors the other agent guide (`AGENTS.md`/`CLAUDE.md`). When changing one, update the other in the same commit.

## Repo Layout

- `apps/server` — local Fastify API (localhost-only)
- `apps/web` — React/Vite/Tailwind dashboard
- `packages/core` — source adapters and aggregation (Codex, Claude)
- `packages/types` — shared normalized model
- `docs/` — publishing notes, ADRs, etc.

## Common Commands

```bash
pnpm install
pnpm dev          # run the local app
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` before opening a PR.

## Pre-Commit Sanity Check (manual)

Before committing changes that touch token aggregation, source adapters (`packages/core/src/sources/*`), pricing, or normalization logic, run a manual cross-check against `ccusage` and compare to the RepoSpend dashboard for the same window:

```bash
npx ccusage@latest          # totals for the current period
npx ccusage@latest daily    # per-day breakdown
pnpm dev                    # open RepoSpend and compare the same window
```

Compare:

- **Total tokens** (input, cached input, output, reasoning) for the same date range.
- **Per-day totals** — look for any day where RepoSpend and `ccusage` diverge.
- **Session counts** — large mismatches usually mean a parser or dedup regression.

Flag any large discrepancy in the PR description (rough rule of thumb: >5% on totals, or any day off by more than a single session). Small drift is expected because RepoSpend normalizes cumulative checkpoints differently from `ccusage`; large drift is a signal to investigate before merging.

**Cost is the source of truth, not token count.** RepoSpend and `ccusage` will routinely show different "total tokens" — especially for Codex sessions with heavy cache reuse — even when costs match to the dollar. The token-count gap comes from accounting style, not a bug:

- RepoSpend treats `cached_input_tokens` as a **subset of** `input_tokens` (matching the OpenAI/Anthropic API contract). `totalTokens = input + output + reasoning`. See `applyFinalUsage` in [packages/core/src/sources/codex-token.ts](packages/core/src/sources/codex-token.ts).
- `ccusage` appears to add cached tokens as a separate addable bucket in its "Total Tokens" column, which inflates the displayed total but does not change billing.

When reviewing a PR that touches token aggregation: if the change moves RepoSpend's token total noticeably closer to `ccusage`, re-check the cost column. A "fix" that adds `cachedInputTokens` to `inputTokens` for display will silently double Codex cost, because [packages/core/src/pricing.ts](packages/core/src/pricing.ts) prices the two buckets separately. **Cost parity is the goal; token-count parity is not.**

Codex per-turn aggregation is also load-bearing: prefer `last_token_usage` (per-turn delta, summed) over `total_token_usage` (cumulative, max). Codex resets the cumulative counter on `/compact`, so max-of-cumulative under-counts any session that compacted. The reasoning is documented at [packages/core/src/sources/codex-token.ts:128](packages/core/src/sources/codex-token.ts:128).

### Codex Desktop on Windows

RepoSpend captures Codex CLI usage from `~/.codex/`. The Codex **Desktop app** ships as the MSIX package `OpenAI.Codex_<id>` under `%LOCALAPPDATA%\Packages\` and does **not** persist session transcripts or real per-turn token usage on disk — only Electron caches and debug logs (the lone token-shaped events in those logs are ephemeral generation events like thread-title naming, not session usage). Real session data lives server-side. Do not add a "Codex Desktop" adapter expecting local token data; there isn't any.

## Project Principles

- Keep RepoSpend local-first. No telemetry, no login, no cloud sync.
- Treat source client data (`~/.codex`, Claude Code files) as read-only.
- Keep adapters isolated under `packages/core/src/sources` so new clients can be added without touching dashboard code.
- Preserve repo-first normalization semantics — the product promise is repo-level visibility.
- Cost language is careful: "API-equivalent cost" is an estimate, not the user's actual bill, subscription usage, savings, or invoice.

## Adapter Invariants

- Source client files are read-only.
- Missing, malformed, old-schema, or unreadable source files should warn, not crash scans.
- Preserve repo-first grouping.
- Do not invent token splits or costs when local data is incomplete.
- Codex cumulative token checkpoints should not be naively summed. Prefer per-turn `last_token_usage` deltas; fall back to max of `total_token_usage` only when no deltas exist.
- `cached_input_tokens` is a subset of `input_tokens`, never an additive bucket. Do not add cached tokens on top of input when computing totals or pricing.
- Claude Code sessions with missing token data should remain visible with unknown cost.

## Adding A Source Adapter

Add adapter code under `packages/core/src/sources`. Convert source-specific data into the shared normalized model in `packages/types`, then expose it through the server data layer.

## Verification By Change

- Core/source adapters: `pnpm --filter @repospend/core test`, then `pnpm test`.
- Shared types: `pnpm --filter @repospend/types build`, then `pnpm typecheck`.
- Web/UI: `pnpm --filter @repospend/web lint`, `pnpm --filter @repospend/web typecheck`, and `pnpm --filter @repospend/web build`.
- Server/API: `pnpm --filter @repospend/server test`, then `pnpm --filter @repospend/server typecheck`.
- Release/package changes: also read `docs/PUBLISHING.md`.

## UX And Copy

- Say "API-equivalent cost" or "estimated API-equivalent cost".
- Do not imply the estimate is the user's actual bill, subscription usage, savings, or invoice.

## Conventions

- TypeScript across the stack; prefer narrow types in `packages/types`.
- Don't introduce project-level setup files that the first run requires — first run should work with zero config.
- Don't add dependencies on cloud services or analytics.
