# Changelog

All notable changes to RepoSpend will be documented in this file.

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
