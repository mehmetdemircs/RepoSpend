# Changelog

All notable changes to RepoSpend will be documented in this file.

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
