# Price context tiers before session aggregation

## Context

Haiku 5.5 charges five times the base token rates for requests over 100,000 prompt tokens, including cached tokens. Session totals cannot identify that threshold. Applying Haiku 4.5's fallback or choosing a tier from the sum of many short requests misprices usage.

## Decision

Keep two flat, separately editable cards in the existing pricing schema. `claude-haiku-5-5-long-context` is an internal rate card, not a provider model ID. The shared cost calculator selects it only when a request's known prompt count exceeds 100K. Exact custom snapshot cards continue to take precedence. Missing request lengths leave tier-dependent estimates unknown.

Price deduplicated Claude requests and Copilot chat/inference records independently, sum unrounded costs, and round once per session. Agent-summary spans and aggregate-only importers cannot establish request length. Keep cache reads/writes as input subsets and preserve the Claude TTL split.

Cache model resolution within the calculation so dated model IDs do not reparse the entire catalog for each request. Emit distinct diagnostics for missing request context and unpriced request-model IDs. Settings exposes auxiliary model IDs and the high-context rate card in its used-model view. Editing an inherited Haiku snapshot updates the shared base card; only an explicitly added exact snapshot creates a flat override.

Bundled prices remain current API-equivalent snapshots. Record promotion boundaries in notes and docs; do not reinterpret the table as historical billing or silently change it with the machine clock. Gemini Argon's November 30 expiry needs a verified follow-up table update.

## Consequences

Mixed context tiers and speeds retain one session and unchanged token totals. Aggregate-only Haiku imports may have unknown costs despite known model rates. Settings can edit both tiers without a new nested pricing schema. No new dependencies, provider calls, or access to source-client files are required.
