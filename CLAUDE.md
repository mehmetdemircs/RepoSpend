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
- Codex cumulative token checkpoints should not be naively summed.
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
