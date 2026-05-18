# Contributing

Thanks for helping improve RepoSpend.

## Local Setup

```bash
pnpm install
pnpm dev
```

Run checks before opening a PR:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

## Project Principles

- Keep RepoSpend local-first.
- Do not add telemetry or login requirements.
- Treat source client data as read-only.
- Keep adapters isolated so new clients can be added without changing dashboard code.
- Preserve repo-first normalization semantics.

## Adding An Adapter

Add adapter code under `packages/adapters`. Convert source-specific data into the shared normalized model in `packages/types`, then expose it through the server data layer.
