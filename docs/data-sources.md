# Data Sources

RepoSpend `0.0.1` reads Codex data from:

- `~/.codex/state_5.sqlite`
- `~/.codex/sessions`

The Codex adapter opens SQLite in read-only mode and recursively scans session files when the sessions directory exists. Missing files, old schemas, unreadable paths, and missing fields are reported as warnings rather than fatal errors.

When Codex exposes app metadata, RepoSpend also normalizes where usage came from. It reads SQLite/session fields such as `source`, `originator`, and `thread_source`, then displays friendly labels like `VS Code`, `Terminal`, `Codex subagent`, or `Codex`.

The normalized usage shape lives in `packages/types` and is intended to support future adapters for Claude Code, Cursor, OpenCode, Gemini CLI, and other local assistants.

RepoSpend never mutates local client data.

RepoSpend-owned settings are stored separately under `~/.repospend/`. The default editable pricing table is `~/.repospend/pricing.json`; future local app settings live in `~/.repospend/config.json`.
