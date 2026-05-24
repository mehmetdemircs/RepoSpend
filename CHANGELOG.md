# Changelog

All notable changes to RepoSpend will be documented in this file.

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
