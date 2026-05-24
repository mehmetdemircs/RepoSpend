# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root (this repo has a root CONTEXT.md),
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

If these files don't exist, proceed silently — don't flag their absence. The producer skill creates them lazily when needed.

## Layout

This repository uses a single-context layout: a single `CONTEXT.md` at the repo root and `docs/adr/` for ADRs. Skills should look at the root CONTEXT.md before they start and check `docs/adr/` for architectural decisions.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't invent synonyms the glossary avoids.

If the concept you need isn't in the glossary yet, note it for `/grill-with-docs`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding.
