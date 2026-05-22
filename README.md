# RepoSpend

[![npm version](https://img.shields.io/npm/v/repospend)](https://www.npmjs.com/package/repospend)
[![npm downloads](https://img.shields.io/npm/dm/repospend)](https://www.npmjs.com/package/repospend)
[![license](https://img.shields.io/npm/l/repospend)](./LICENSE)
[![node](https://img.shields.io/node/v/repospend)](https://www.npmjs.com/package/repospend)
[![CI](https://github.com/mehmetdemircs/RepoSpend/actions/workflows/ci.yml/badge.svg)](https://github.com/mehmetdemircs/RepoSpend/actions/workflows/ci.yml)

RepoSpend shows where your AI coding tool usage is going across Codex, Claude Code,
Cursor, and RTK. It is local, private, and repo-first.

It reads supported local usage files in read-only mode and groups sessions by Git
repo.

No login. No telemetry. No prompt uploads.

```bash
npx repospend
```

RepoSpend opens a local dashboard, usually at
[http://localhost:2005](http://localhost:2005).

## Preview

![RepoSpend overview dashboard with fictional Middle-earth usage data](docs/screenshots/dashboard-overview.png)

Screenshots use fictional Middle-earth demo data. The Lord of the Rings themed
repo names, sessions, prompts, token counts, and costs are intentional; no private
repository data is shown.

## Why RepoSpend?

AI coding tools are powerful, but it is hard to see where the usage goes.

RepoSpend helps answer:

- Which repo is using the most tokens?
- Which sessions were unusually expensive?
- Which model or tool generated the spend?
- Where did the agent get stuck retrying commands?
- How much would this usage roughly cost at API-style rates?

Everything stays local.

## Quick Start

Run without installing globally:

```bash
npx repospend
```

Or install it once:

```bash
npm install -g repospend
repospend
```

RepoSpend starts a local dashboard, binds to localhost, opens your browser, and
prints the dashboard URL. By default it runs at
[http://localhost:2005](http://localhost:2005).

## Supported Tools

| Tool | Status | Notes |
|---|---|---|
| Codex | Most complete support | Tokens, models, sessions, repo grouping, command friction |
| Claude Code | Initial support | Sessions, projects, models, timestamps, tokens when available |
| Cursor | Experimental | Local JSONL and SQLite/vscdb discovery; tokens/cost only when local data includes them |
| RTK | Optional/local | Shown only when local RTK data exists |

RepoSpend started as a Codex-first release. Claude Code and Cursor support are
newer and depend on what those tools persist locally.

## Requirements

- Node.js `20` or newer
- macOS, Linux, or Windows
- Local Codex, Claude Code, Cursor, or RTK data, depending on what you want to inspect

RepoSpend uses `better-sqlite3`, so npm may install a native SQLite package for
your platform.

## What It Shows

RepoSpend helps you break down local AI coding usage by:

- repo
- session
- day and hour
- model
- source/tool and app/surface, where detectable
- token type
- estimated API-equivalent cost

If Codex records work from both of these paths:

```text
/Users/elrond/dev/RivendellRecords
/Users/elrond/dev/RivendellRecords/apps/web
```

RepoSpend walks up to the Git root and shows them together as one
`RivendellRecords` project.

## Screenshots

### Repositories

![RepoSpend repositories table with fictional repo usage](docs/screenshots/repos-view.png)

The repos view compares spend, tokens, sessions, cache hit rate, file edits, and
token intensity across projects.

### Repository Detail

![RepoSpend repository detail for one-ring-infra](docs/screenshots/repo-detail.png)

Repo detail explains why a project stands out, including cost concentration,
warnings, token shape, sessions, and command signals.

### Sessions

![RepoSpend sessions table with fictional session titles](docs/screenshots/sessions-view.png)

The sessions view makes individual AI coding runs searchable and sortable by
repo, tool, model, outcome, cost, tokens, and activity.

### Session Detail

![RepoSpend session detail for a fictional palantir event stream fix](docs/screenshots/session-detail.png)

Session detail shows the shape of one run: cost, tokens, model, file edits,
commands, highlights, and issues to inspect.

### Agent Friction

![RepoSpend agent friction screen with fictional command issue signals](docs/screenshots/agent-friction.png)

Agent Friction separates blocking command failures from harmless shell exits so
high-token troubleshooting is easier to review.

## Privacy

RepoSpend is local-first. Everything the dashboard shows comes from files already
on your machine.

- No login or account required.
- No telemetry.
- No prompt or transcript uploads.
- It does not modify Codex, Claude Code, Cursor, or RTK files.
- It does not claim to match your subscription bill exactly.
- It does not read Codex Desktop server-side sessions that are not stored locally.

## Cost Estimates, Not Invoices

RepoSpend shows **API-equivalent cost**.

That means it estimates cost from local token counts and the pricing assumptions
stored in RepoSpend. It is useful for comparing repos and sessions, but it is not
an invoice.

Your actual cost may be different because of subscriptions, credits, included
usage, account-level terms, provider changes, or other billing details. If you use
Codex or Claude Code through a subscription, read the number as "what this token
usage would roughly cost at API-style rates."

Codex support is the most complete today. Claude Code and Cursor support depend
on what those tools store locally, so some sessions may show unknown tokens or
cost.

### Token Accounting

RepoSpend uses normalized model-work totals:

```text
totalTokens = inputTokens + outputTokens + reasoningTokens
```

Cache reads and cache writes are kept as input sub-buckets and priced once. This
means RepoSpend token totals may look lower than tools that display cache
reads/writes as separate addable token columns.

For the detailed accounting model and comparison with `ccusage` and Tokscale,
see [docs/token-accounting.md](docs/token-accounting.md).

## What It Reads

RepoSpend only reads local files. It does not edit Codex, Claude Code, Cursor, or
RTK data.

Codex data:

```text
~/.codex/state_5.sqlite
~/.codex/sessions
```

Claude Code data:

```text
~/.claude/projects
~/.config/claude/projects
~/Library/Application Support/Claude/local-agent-mode-sessions
~/.config/Claude/local-agent-mode-sessions
```

RepoSpend also checks `~/.claude/history.jsonl` for source status, but does not
import history-only entries into usage analytics because they do not contain
reliable token/model data.

Claude Code transcript files can contain prompt text, tool output, and file
contents. RepoSpend keeps all scanning local.

Cursor data (experimental):

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

RepoSpend-owned settings:

```text
~/.repospend/pricing.json
~/.repospend/config.json
```

The Settings page includes a reset action for RepoSpend-owned files under
`~/.repospend/`. It does not delete or edit anything under `~/.codex` or
`~/.claude`.

## Commands

Most users only need:

```bash
repospend
```

There are also a few terminal-friendly commands:

```bash
repospend scan
repospend by-repo
repospend by-day
repospend by-hour
repospend by-model
repospend by-app
repospend export --format json
repospend export --format csv
```

Most commands also accept a simple source filter:

```bash
repospend by-repo --source codex
repospend by-repo --source claude
repospend by-repo --source cursor
repospend by-repo --source all
```

Use `REPOSPEND_NO_OPEN=1 repospend` if you want the URL printed without opening a
browser.

## Current Limits

- Codex support is still the most complete path for token and command-friction
  analysis.
- Claude Code support is initial: sessions, projects, timestamps, models, and
  token usage are shown when present in local JSONL files.
- Claude Code sessions without local token details are shown with unknown
  tokens/cost.
- Cursor support is experimental: local transcript/session discovery is
  best-effort, and Cursor may omit token/cost details or change local schemas.
- Cost estimates do not represent subscription billing, credits, regional
  pricing, or account-specific terms.
- Budget alerts are not available yet.
- Some older sessions may not include full token, command, or prompt details.
- RTK analytics appear only when local `rtk` data is available.
- On Windows, RepoSpend captures Codex **CLI** usage from `~/.codex/`. The Codex
  **Desktop app** does not persist session transcripts or per-turn token usage to
  disk; real session data lives server-side.

## Troubleshooting Cursor Import

Cursor local files vary by version and surface. To inspect what exists locally:

```bash
find ~/.cursor -type f | grep -E "jsonl|sqlite|db|vscdb|chat|transcript"
ls -la "$HOME/Library/Application Support/Cursor/User/globalStorage"
ls -la "$HOME/Library/Application Support/Cursor/User/workspaceStorage"
```

On Linux, replace the `Library/Application Support` paths with
`$HOME/.config/Cursor/User/...`. On Windows, check
`%APPDATA%\Cursor\User\globalStorage` and `%APPDATA%\Cursor\User\workspaceStorage`.

If Cursor sessions import with unknown tokens or cost, that usually means the
local files did not include exact usage data. RepoSpend keeps the session visible
and avoids guessing.

## Develop

From source:

```bash
pnpm install
pnpm dev
```

Useful checks before publishing:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm dev` starts the API on
[http://127.0.0.1:4318](http://127.0.0.1:4318) and the dashboard on
[http://127.0.0.1:2005](http://127.0.0.1:2005), with `/api` proxied locally.

## Maintainers

Publishing notes are in [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Security

Please see [SECURITY.md](SECURITY.md) for reporting security issues.

## Changelog

Please see [CHANGELOG.md](CHANGELOG.md) for release notes.

## License

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)
