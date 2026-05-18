# RepoSpend

RepoSpend is a local dashboard for seeing where your AI coding usage is going.

It reads your local Codex data, groups work by Git repository, and shows the repos,
sessions, models, commands, and days that are driving token usage and
API-equivalent cost.

`0.0.1` is an early Codex-first release.

## Why RepoSpend?

AI coding usage usually gets shown by date, model, or raw session. RepoSpend starts
with the thing most developers actually care about: the repo.

If Codex records work from both of these paths:

```text
/Users/elrond/dev/RivendellRecords
/Users/elrond/dev/RivendellRecords/apps/web
```

RepoSpend walks up to the Git root and shows them together as one
`RivendellRecords` project.

That makes it easier to answer questions like:

- Which repo is using the most tokens?
- Which sessions were unusually expensive?
- How much came from cached input, output, or reasoning tokens?
- Are command failures or repeated tool issues adding friction?
- Which models and days are driving the total?

## Run It

You can run RepoSpend without installing it globally:

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

RepoSpend requires Node.js `20` or newer. It uses `better-sqlite3`, so npm may
install a native SQLite package for your platform.

## Commands

Most of the time you only need:

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

Use `REPOSPEND_NO_OPEN=1 repospend` if you want the URL printed without opening a
browser.

## What It Reads

RepoSpend reads Codex data from:

```text
~/.codex/state_5.sqlite
~/.codex/sessions
```

Those files are opened read-only. RepoSpend does not modify Codex data.

RepoSpend stores its own settings here:

```text
~/.repospend/pricing.json
~/.repospend/config.json
```

The Settings page includes a reset action for RepoSpend-owned files under
`~/.repospend/`. It does not delete or edit anything under `~/.codex`.

## About Cost

RepoSpend shows **API-equivalent cost**.

That means it estimates cost from local token counts and the pricing assumptions
stored in RepoSpend. It is useful for comparing repos and sessions, but it is not
an invoice.

Your actual cost may be different because of subscriptions, credits, included
usage, account-level terms, provider changes, or other billing details. If you use
Codex through a subscription, read the number as "what this token usage would
roughly cost at API-style rates."

## Privacy

RepoSpend is local-first:

- no login
- no telemetry
- no prompt uploads
- no changes to Codex files

Everything the dashboard shows comes from files already on your machine.

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

## Current Limits

- Codex is the first supported data source.
- Cost is estimated, not billed.
- Budget alerts are not active yet.
- Some older sessions may not include full token, command, or prompt details.
- Unknown models show token totals with unknown cost instead of guessing.
- RTK analytics appear only when local `rtk` data is available.

## License

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)
