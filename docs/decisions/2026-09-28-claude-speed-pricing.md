# Claude speed-aware pricing

Claude transcripts expose speed separately from model IDs. Selecting rates from a model alone understates fast-mode usage.

Group deduplicated usage events by pricing model and speed within each existing day/model session, normalize cache buckets once, and sum the independently priced buckets. Keep session counts, model names, and token totals intact. Explicit fast-mode IDs and dated variants resolve to the same published cards. Opus 4.6 retains Standard rates; unknown fast cards keep the session cost unknown.

This supports mixed-speed sessions without guessing regional, long-context, or subscription charges. A partially unpriced session remains unpriced as a whole.
