# Data Sources

RepoSpend only reads local files. It never mutates source client data.

## Codex

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

## Claude Code

RepoSpend scans:

- `~/.claude/projects`
- `~/.config/claude/projects`
- `~/Library/Application Support/Claude/local-agent-mode-sessions`
- `~/.config/Claude/local-agent-mode-sessions`

Claude Code session transcripts are parsed from JSONL files. Useful fields include `sessionId`, `cwd`, `gitBranch`, `timestamp`, `entrypoint`, `message.model`, and `message.usage`. When `message.usage` is present, RepoSpend sums Claude assistant usage records directly. When token counts or model names are absent in a transcript, sessions remain visible with unknown cost.

RepoSpend checks `~/.claude/history.jsonl` only for source status/counting. History-only entries are not imported into usage analytics because they do not include reliable token, model, or transcript data.

## GitHub Copilot

RepoSpend scans GitHub Copilot local files:

- `~/.copilot/otel/*.jsonl`
- the explicit file in `COPILOT_OTEL_FILE_EXPORTER_PATH`
- `~/.copilot/session-state/*/events.jsonl`
- VS Code `User/workspaceStorage/*/GitHub.copilot-chat/{transcripts,debug-logs}`

Copilot OpenTelemetry records can include exact input, cached input, cache
creation, output, and reasoning token fields. RepoSpend imports those directly,
deduping lower-priority agent summary records when a more specific chat span or
inference record is present. Copilot CLI session-state files currently expose
repo context and output-token counts, but not a full input/cache split; RepoSpend
shows those tokens as partial usage and leaves cost unknown rather than inventing
missing input. VS Code Copilot Chat transcripts remain visible even when they do
not contain token data.

## Cursor

Cursor support is experimental and opt-in because local Cursor files vary by
version, platform, and product surface. Cursor may store useful transcript data
without exact token or cost fields, and some usage data may only exist in
account-backed services rather than local files.

RepoSpend scans local Cursor paths such as:

```text
~/.cursor/
~/.cursor/chats/
~/.cursor/projects/
~/.cursor/projects/*/agent-transcripts/
~/Library/Application Support/Cursor/User/globalStorage/state.vscdb
~/Library/Application Support/Cursor/User/workspaceStorage/
~/.config/Cursor/User/globalStorage/state.vscdb
~/.config/Cursor/User/workspaceStorage/
%APPDATA%\Cursor\User\globalStorage\state.vscdb
%APPDATA%\Cursor\User\workspaceStorage\
```

RepoSpend prioritizes Cursor JSONL transcripts, then searches local SQLite,
`.db`, and `.vscdb` files for chat/composer/agent-like JSON blobs. Unknown or
locked Cursor databases are skipped with warnings. Prompt and response text is
never uploaded.

If Cursor sessions import with unknown tokens or cost, that usually means the
local files did not include exact usage data. RepoSpend keeps the session visible
and avoids guessing.

### Troubleshooting Cursor Import

To inspect what exists locally:

```bash
find ~/.cursor -type f | grep -E "jsonl|sqlite|db|vscdb|chat|transcript"
ls -la "$HOME/Library/Application Support/Cursor/User/globalStorage"
ls -la "$HOME/Library/Application Support/Cursor/User/workspaceStorage"
```

On Linux, replace the `Library/Application Support` paths with
`$HOME/.config/Cursor/User/...`. On Windows, check
`%APPDATA%\Cursor\User\globalStorage` and
`%APPDATA%\Cursor\User\workspaceStorage`.

The normalized usage shape lives in `packages/types` and is intended to support future adapters for OpenCode, Gemini CLI, and other local assistants.

For details on cache, reasoning, and comparison with tools such as `ccusage` and
Tokscale, see [token-accounting.md](token-accounting.md).

## RepoSpend-Owned Data

RepoSpend-owned settings are stored separately under `~/.repospend/`:

```text
~/.repospend/pricing.json
~/.repospend/config.json
~/.repospend/cache/
```

The default editable pricing table is `~/.repospend/pricing.json`; local app
settings live in `~/.repospend/config.json`. RepoSpend caches parsed session
summaries under `~/.repospend/cache/` so unchanged large transcripts reload
faster.

The Settings page includes a reset action for RepoSpend-owned files under
`~/.repospend/`. It does not delete or edit anything under source client paths
such as `~/.codex`, `~/.claude`, `~/.copilot`, or Cursor storage directories.
