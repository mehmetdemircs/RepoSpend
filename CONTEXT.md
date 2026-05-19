# RepoSpend Context

RepoSpend is a local-first AI coding usage dashboard. The product promise is repo-first visibility: show which Git repositories, sessions, models, command patterns, and days are consuming local AI coding tokens.

## Current Release

- Version: `0.0.5`
- Scope: early debug release
- Source clients: Codex and initial Claude Code support
- Server: localhost-only local Fastify API
- Dashboard: React/Vite/Tailwind dark analytics UI
- Storage: reads Codex from `~/.codex` and Claude Code from local Claude paths; stores RepoSpend-owned local settings under `~/.repospend`
- License: Apache-2.0

## Main Navigation

- **Overview**: high-level token, API-equivalent cost, top repo, session, edit, chart, and insight summary.
- **Repos**: primary repo-first analysis. Repo rows open focused `/repos/:repo` detail pages.
- **Sessions**: searchable, paginated session inventory. Rows open focused `/sessions/:sessionId` detail pages.
- **Agent Friction**: important command issues separated from harmless non-zero shell exits.
- **Insights**: actionable health and attention signals.
- **RTK**: token savings from the local `rtk` command proxy when available.
- **Settings**: pricing assumptions, display settings, data sources, token counting, and privacy notes.

## Domain Terms

- **Codex Session**: A local Codex thread or session file imported read-only from `~/.codex`.
- **Token Checkpoint**: A token-count record emitted by Codex logs. Some checkpoints are cumulative, so RepoSpend prefers the final valid checkpoint per session instead of summing repeated checkpoints.
- **Token Aggregation**: The process that turns Codex token events into normalized input, cached input, output, reasoning, and total token counts, plus method and confidence.
- **Repo Usage Rollup**: A Git-repository-level aggregate that combines normalized sessions, token totals, API-equivalent cost, warnings, command friction, and Token ROI.
- **Dashboard Snapshot**: The filtered, zero-token-cleaned read model used by the local API and dashboard.
- **Usage Health**: Derived signals that explain what looks healthy, what needs attention, and which sessions are affected.
- **Agent Friction**: Command signals focused on important failures, repeated failure clusters, high-impact command issues, and harmless non-zero exits.
- **API-equivalent Cost**: A local estimate based on token counts and public API-style pricing assumptions. It is not the user's actual ChatGPT, Codex, Claude, or Claude Code bill.
- **RTK Savings**: Estimated tokens avoided by the local `rtk` command proxy, when local RTK reports are available.
- **Data Health**: Local scan status: files scanned, sessions imported, parser issues, token checkpoints, and last scan time.

## UX Principles

- Lead with tokens, repos, sessions, and API-equivalent cost, not parser/debug details.
- Keep Data Health and Token Counting visible but lower priority.
- Make large tables paginated and sortable.
- Hide technical columns by default; expose them through column controls.
- Use focused detail pages for sessions and repos instead of crowding list pages.
- Keep cost language careful: estimates are not actual bills, subscription usage, savings, or invoices.
- Keep local-first trust visible: no login, no telemetry, no cloud sync.
- Avoid project-level setup in the early debug release; first run should work without creating repo config files.
