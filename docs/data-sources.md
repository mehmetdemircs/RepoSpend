# Data Sources

RepoSpend reads Codex data from:

- `~/.codex/state_5.sqlite`
- `~/.codex/sessions`

The Codex adapter opens SQLite in read-only mode and recursively scans session files when the sessions directory exists. Missing files, old schemas, unreadable paths, and missing fields are reported as warnings rather than fatal errors.

When Codex exposes app metadata, RepoSpend also normalizes where usage came from. It reads SQLite/session fields such as `source`, `originator`, and `thread_source`, then displays friendly labels like `VS Code`, `Terminal`, `Codex app`, or `Codex`.

Codex token records can include repeated cumulative checkpoints and per-turn
usage deltas. RepoSpend prefers `last_token_usage` per-turn deltas when present,
because Codex can reset cumulative `total_token_usage` after compaction. It also
keeps cache reads as a sub-bucket of input and separates reasoning output from
visible output so each billable bucket is counted once.

RepoSpend also has initial Claude Code support. It scans:

- `~/.claude/projects`
- `~/.config/claude/projects`
- `~/Library/Application Support/Claude/local-agent-mode-sessions`
- `~/.config/Claude/local-agent-mode-sessions`

Claude Code session transcripts are parsed from JSONL files. Useful fields include `sessionId`, `cwd`, `gitBranch`, `timestamp`, `entrypoint`, `message.model`, and `message.usage`. When `message.usage` is present, RepoSpend sums Claude assistant usage records directly. When token counts or model names are absent in a transcript, sessions remain visible with unknown cost.

RepoSpend checks `~/.claude/history.jsonl` only for source status/counting. History-only entries are not imported into usage analytics because they do not include reliable token, model, or transcript data.

The normalized usage shape lives in `packages/types` and is intended to support future adapters for Cursor, OpenCode, Gemini CLI, and other local assistants.

For details on cache, reasoning, and comparison with tools such as `ccusage` and
Tokscale, see [token-accounting.md](token-accounting.md).

RepoSpend never mutates local client data.

RepoSpend-owned settings are stored separately under `~/.repospend/`. The default editable pricing table is `~/.repospend/pricing.json`; future local app settings live in `~/.repospend/config.json`.
