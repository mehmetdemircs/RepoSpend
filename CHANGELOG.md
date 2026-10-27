# Changelog

All notable changes to RepoSpend will be documented in this file.

## Unreleased

## 0.1.8

- Add explicit GPT-6.1 Terra Standard API-equivalent pricing ($1 input / $0.05 cached input / $5 output per 1M) with alias, snapshot, and custom-override handling, and per-request long-context cards for GPT-6/6.1 models: a single request over 272,000 input tokens reprices that request at 2x input/cache rates and 1.5x output rates. The same per-request tiers now cover the GPT-5.x Standard cards (5.6 Sol/Terra/Luna, 5.5, 5.5 Pro, 5.4, 5.4 Pro); mini and nano have no published tier and stay flat.
- Price each Codex request with the model that was active for it instead of the session's first model, keep per-model token/cost slices on the session for accurate model rollups and filters without duplicating sessions, and fall back to session-level pricing with an explicit `assumed_short_context_rates` / `missing_long_context_pricing` assumption when per-request detail is unavailable.
- Normalize OpenAI nested cache usage (`input_tokens_details.cached_tokens`, `cache_write_tokens`) and 30-minute/12-hour cache-write TTLs through token aggregation, pricing, exports, and the pricing editor; unclassified writes keep billing at the generic cache-write rate, and the Codex parse cache is versioned (`parse-v2`/`codex-session-v2`) so older cached breakdowns are rebuilt.
- Protect the local dashboard, JSON, and CSV export endpoints against DNS-rebinding via non-local `Host` headers, while still allowing localhost, `127.0.0.1`, `[::1]`, health checks, and CLI requests without a Host header; no login or auth UX added. Encoded forms of those paths (for example `/api/%64ashboard`) are decoded the same way the router decodes them before the guard runs, so percent-encoded GET and HEAD requests cannot evade the check.
- Keep intentional flat custom prices for canonical GPT-6/6.1 and tiered GPT-5.x models at request sizes above 272K input tokens instead of silently switching to the bundled long-context card; a user-saved long-context card still re-enables tiered pricing for that model. Settings reads the engine's base→long-context mapping so alias bases such as `gpt-5.6` label their real long-context card correctly, and a shared card is only called "not applied" when every base that maps to it is a custom flat card.
- Project only the selected models' `modelUsage` slices into filtered accounting — tokens, costs, cache totals, model groups, repo/day/hour summaries, and exports — while preserving one session identity per filtered session, and rank each model's top repository by that model's own slices rather than whole-session spend.
- Refresh runtime dependencies within approved ranges (Fastify 5.12.7, @fastify/static 10.1.8) and patch transitive audit findings via scoped overrides (find-my-way, fast-uri 3.x, tinypool, postcss, nanoid, js-yaml, brace-expansion, vite 6.4.5 for the test toolchain). The public runtime floor is now Node >=22.12 because @fastify/static 10 requires `content-disposition` 3 (ESM-only) — the packaged CLI and dashboard were verified on Node 22.12.0, and CI checks Node 22.12.0 and 24.
- Bump Vitest to 3.2.7 and esbuild/sharp to their latest compatible patch releases; remaining audit findings are moderate and limited to Vitest's browser-mode mocker, which RepoSpend does not use.

## 0.1.7

- Correct Claude Sonnet 5.5 cache reads to $0.10 per million tokens following the October 7 price reduction, without changing Sonnet 5 or intentional custom overrides.
- Add Claude Haiku 5.5 pricing for prompts up to and over 100,000 tokens, including both cache-write TTLs. Price deduplicated Claude and Copilot inference requests before summing session costs; leave aggregate-only Haiku usage unpriced when request lengths are unknown.
- Add Gemini 4 Argon and Copilot aliases at introductory $2 input / $0.10 cached input / $10 output rates, with the November 30 promotion expiry recorded in pricing documentation.
- Preserve exact custom snapshot cards and migrate unchanged Sonnet 5.5 rows in legacy full-table pricing settings.
- Sum unrounded request costs before rounding the session estimate to six decimal places.
- Keep inherited Haiku snapshot edits on the shared base card, expose the higher-tier card alongside used models, and explain missing request context and auxiliary model rates in pricing triage.
- Preserve Haiku rate-card identity while typing or clearing numeric fields, keep pricing columns compact, and show readable request-pricing diagnostics across repo views.
- Cache model resolution within each session's cost calculation and preserve tolerated numeric-string Claude input counts during deduplication.

## 0.1.6

- Add explicit GPT-6.1 Sol Standard API-equivalent pricing, including its lower $0.10 cached-input rate, without changing GPT-6 Sol estimates.
- Resolve date-suffixed GPT model IDs to the correct generation while preserving custom snapshot overrides, including case-insensitive and provider-prefixed aliases, and unknown fast-mode cards.
- Add model pricing and Codex usage guide links to the README and AI-readable documentation, with current pricing sources and estimate limits.

## 0.1.5

- Correct GPT-5.6 Sol and its alias to the current promotional rates, preserving custom pricing overrides.
- Add explicit Claude Sonnet 5.5 rates and newer Gemini Flash, MAI-Code, Grok, and Kimi Copilot models.
- Price Claude Opus 4.8, 5, and 5.5 fast-mode usage separately, including mixed-speed sessions and cached token buckets.
- Keep fast requests without a published rate unpriced rather than inheriting Standard rates.
- Prevent date-suffixed older Claude model IDs from inheriting newer model prices.
- Record promotional pricing dates and update model aliases and pricing documentation.

## 0.1.4

- Add exact Standard API-equivalent rates for GPT-6 Astra, Sol, and Luna, including cached input and cache writes.
- Add Claude Fable 5.1, Mythos 5.1, Opus 5, and Opus 5.5 rates, including the lower cache-read rates for the newest models.
- Leave unlisted fast-mode model IDs unpriced instead of silently applying Standard rates.
- Keep legacy full pricing files eligible for bundled rate updates as new model rows are added, while preserving custom pricing overrides.
- Correct the Claude Sonnet 5 pricing note to reflect Anthropic's permanent $2 input and $10 output rates.
- Document the limits of short-context Standard pricing estimates for long-context and other processing modes.

## 0.1.3

- Correct GPT-5.6 Terra and Luna API-equivalent pricing to the reduced July 30, 2026 OpenAI rates, including cached-input and cache-write rates.
- Migrate legacy full pricing files so the new Terra and Luna defaults take effect while preserving sparse user overrides and custom model rows.
- Improve unverified repo and folder grouping by using the outermost project marker below a safe shared-folder boundary, keeping nested non-Git workspace paths together without collapsing them into broad folders such as `Desktop`.
- Show paths relative to the home directory for unverified workspace labels so similarly named folders such as `src` remain distinguishable.

## 0.1.2

- Add bundled GPT-5.6 API-equivalent pricing for the Sol, Terra, and Luna tiers, including cache-write and cached-input rates.
- Add bundled Claude Sonnet 5 introductory pricing through August 31, 2026, with dated model ID family pricing and a note for the standard September 1, 2026 rate.
- Add Claude Opus 4.8 fast mode pricing and keep special fast-mode rate cards separate from regular Opus family fallback.
- Add GitHub Copilot pricing coverage for MAI-Code-1-Flash and Kimi K2.7 Code, including suffix variant matching for local Copilot model IDs.
- Add the OpenAI GPT-5.6 preview pricing source to the bundled pricing metadata shown in Settings.
- Ignore local generated `marketing/` assets so release diffs stay focused on source, docs, and packaged files.

## 0.1.1

- Add bundled Claude Fable 5 and Claude Mythos 5 API-equivalent pricing, including dated model ID family pricing and future Fable/Mythos version fallback.
- Price Claude cache writes from the local 5-minute vs 1-hour TTL split when transcripts expose it, with the 1-hour rate kept as the fallback for unsplit cache creation.
- Improve the dashboard filter bar by replacing always-expanded filter groups with compact dropdowns that close when another filter opens, Escape is pressed, or the user clicks outside.
- Move the Overview timeline and chart controls directly under the KPI row, keeping diagnostics such as Token Counting in Settings instead of the daily-glance flow.
- Replace Settings save and local-cache actions that forced full page reloads with React refetches that preserve page context.
- Improve chart readability with stable repo colors, positive-only minimum bar size, and a model distribution share panel for skewed model usage.
- Reduce badge and copy noise by quieting provider badges, preserving outcome color, simplifying empty filter copy, and showing a compact filtered-view notice on pages without the filter bar.
- Improve responsive and accessibility polish with a horizontal narrow-width nav, safer filter popover alignment, system font fallback, tabular numeric values, and reduced-motion CSS.

## 0.1.0

- Add GitHub Copilot support for local OTEL exports, Copilot session-state files, and VS Code Copilot Chat transcript/debug files, leaving cost unknown when local data lacks full token splits.
- Add Copilot source status, labels, settings metrics, quick links, tests, API-equivalent model pricing aliases, and VS Code model metadata recovery.
- Add Claude service-tier metadata and Codex current-config service-tier visibility in the dashboard cost summary and settings.
- Add a Data Doctor confidence report in the dashboard, Settings, and `repospend doctor`, covering token coverage, pricing coverage, repo verification, parser issues, source warnings, and empty-data states.
- Add pricing-gap triage in Settings and Usage Health, with one-click review of unpriced token-bearing sessions and clearer separation between missing model rates and missing token detail.
- Add bundled Claude Opus 4.8 pricing and inherited pricing labels for nearby newer Claude and GPT model IDs when an exact local rate is not present.
- Improve dashboard scanability by simplifying the Overview, promoting "Start here" actions, normalizing compact number/model labels, cleaning noisy markdown session titles, and adding a Sessions cost-outlier legend.
- Improve Agent Friction by treating command failures as triage evidence, routing review actions directly to command evidence, and avoiding false positives from source text or HTTP-style status codes.
- Add dashboard-style filters to CLI summaries and exports, and apply API export filters consistently across JSON and CSV.
- Harden localhost settings/cache mutations with Host and Origin checks for local API writes.
- Remove unused budget configuration and UI/documentation copy so old budget fields are intentionally dropped on the next config save.
- Improve README, package metadata, AI-readable docs, and dashboard screenshots for repo-level AI coding usage discovery while keeping Cursor experimental and RTK framed as token-reduction workflow context.
- Move detailed source paths and Cursor troubleshooting into `docs/data-sources.md`, and publish the linked docs with the npm package.
- Raise the Vite chunk warning threshold to match the current local dashboard bundle size.

## 0.0.9

- Cache parsed Codex session summaries under `~/.repospend/cache` so unchanged large transcripts reload much faster.
- Limit local source scanning to the active dashboard date window when possible, reducing default last-7-days scan work.
- Warm a bounded last-30-days cache in the background after the default last-7-days dashboard loads, without auto-scanning all-time history.
- Make refresh/rescan/retry actions clear RepoSpend's parse cache before reloading local logs.
- Add an Advanced settings action to clear only the parse cache and reload without deleting pricing or source settings.
- Keep demo mode from reading, warming, or clearing the real local parse cache.
- Make experimental Cursor support opt-in so default scans and dashboard surfaces stay focused on Codex and Claude Code unless Cursor is explicitly enabled in Settings.
- Add a local Data Sources setting for enabling Cursor, with copy explaining that reliable Cursor tokens, model names, and costs are often unavailable from local transcript files alone.
- Hide Cursor quick links, loading-state rows, and status copy while the experimental Cursor source is disabled.
- Improve Cursor CLI metadata recovery by inferring transcript dates and repo paths from Cursor's local project/transcript paths when records omit timestamp or cwd fields.
- Avoid an unnecessary standalone Codex session pass for sessions already imported from the Codex SQLite thread index.

## 0.0.8

- Make `repospend serve` and `npx repospend` recover when the default localhost port is already in use by trying nearby ports instead of exiting with `EADDRINUSE`.
- Print a clear message when RepoSpend falls back from the requested port to the actual dashboard port.
- Add a Models view with per-model token shape, API-equivalent cost, cache reuse, top repo, latest activity, and one-click filter into Sessions.
- Reorder the Overview so the Top repositories and Waste signals panels appear higher on the page.
- Refresh the dashboard accent color from purple to teal across nav, KPI cards, and the metric timeline.
- Replace the Sessions page mini-stats with filter-aware totals (tokens, API-equivalent cost, sessions needing review, edits, commands).
- Make the filters bar scroll with the page instead of sticking to the top.
- Collapse the "How Agent Friction is classified" explainer into a disclosure to reduce vertical noise on the Agent Friction page.

## 0.0.7

- Add experimental Cursor support with read-only discovery for local JSONL transcripts and SQLite/vscdb storage, keeping sessions visible when token or cost data is unavailable.
- Include Cursor in source filters, dashboard source health, README data-source documentation, and CLI help.
- Track known vs. unknown-cost sessions in grouped breakdowns so mixed Cursor or Claude data does not hide partial cost coverage.
- Improve Claude Code aggregation by merging duplicate streaming usage rows with per-field maxima, deduplicating resumed usage after that merge, and splitting multi-day/model sessions into activity-day segments.
- Improve Codex token aggregation by skipping duplicate or stale `last_token_usage` snapshots while preserving post-compaction token deltas.
- Refresh the dashboard IA and UI copy around "AI providers", "apps / surfaces", repo-or-folder grouping, quick actions, filter summaries, and Cursor usage links.
- Improve the local scan loading state with elapsed timing, staged scan context, source-level hints, and previous-scan context while refreshes are running.
- Ignore local `.codex/` files.

## 0.0.6

- Improve Codex session metadata recovery from rollout logs, including standalone Codex Desktop sessions and imported Claude model metadata.
- Add an optional source-scoped app display mode so shared surfaces can be shown as source-specific entries such as "Codex on VS Code".
- Improve sparse timeline charts and RTK unavailable-state guidance in the dashboard.
- Document why RepoSpend token totals can differ from `ccusage` while API-equivalent costs still match.
- Show a git-branch icon next to repos with a confirmed git root and a folder icon for path-inferred repos, giving a quick visual signal of data confidence.
- Fix Windows extended-length path prefix (\\?\) handling in git root detection, which caused repos on Windows to incorrectly appear as unverified.


## 0.0.5

- Fix Codex token under-count on long sessions by summing per-turn `last_token_usage` instead of taking the max of `total_token_usage`, which Codex resets on each context compaction.
- Track Codex context compactions per session (auto vs. manual `/compact`) and surface them in the session detail panel.
- Filter Codex startup-context blobs (AGENTS.md/INSTRUCTIONS/environment_context) out of the prompt timeline and prompt counts.
- Dedupe Claude Code token usage across resumed `.jsonl` files using `requestId` + message `id`, so replayed assistant turns are not double-billed.
- Label Codex sub-agent sessions as "Codex subagent" instead of folding them into "Codex app".
- Show the running RepoSpend version in the dashboard footer.
- Publish a GitHub release with the matching `CHANGELOG.md` section whenever a `v*.*.*` tag is pushed.

## 0.0.4

- Automatically retry Codex SQLite access after attempting to rebuild `better-sqlite3` when an `npx` or local install has a Node native module ABI mismatch.

## 0.0.3

- Add initial Claude Code support for local JSONL session transcripts, including projects, timestamps, models, token usage when available, and source status.
- Add source filtering across dashboard data and CLI summaries with `--source all|codex|claude`.
- Add bundled Claude pricing coverage, cache write input pricing, and Claude family pricing fallback for dated model IDs.
- Refresh the dashboard experience with source-aware views, Settings improvements, and fictional demo screenshots.
- Document supported Codex and Claude Code data sources, pricing assumptions, privacy boundaries, security reporting, and release notes.
- Remove the roadmap document from `docs/`.

## 0.0.2

- Add GitHub CI and npm publish workflow support.
- Improve npm package metadata for discovery and release publishing.
- Keep RepoSpend focused on local-first AI coding usage visibility.

## 0.0.1

- Initial public release.
- Add Codex-first local usage dashboard.
- Add CLI entry point for running RepoSpend locally.
