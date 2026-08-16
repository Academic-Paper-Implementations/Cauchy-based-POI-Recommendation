---
title: Thread display attributes to the click-POI explorer response
date: 2026-08-16
summary: "Registered cuisine datasets + carried name/stars/attributes to query_instance; additive, 76 tests green"
---

# Thread display attributes to the click-POI explorer response

## What happened

Phase 3 backend for the spot explorer, run under kongming advisory supervision.
A pre-implementation consult caught a plan-vs-reality mismatch: the plan named
`instance_recommendations` (recommend_for_point) as the click-POI source, but
that endpoint returns feature-level "what to add here" recommendations plus
nearby COUNTS — no per-neighbour POI, no distance. The correct source is
`query_instance` (endpoint /api/jobs/{id}/instances/{feature}/{number}), which
already returns the patterns a clicked POI participates in, each with its
co-participating neighbour POIs carrying `distance_m`, grouped by pattern.

Implemented per kongming's counsel: `ColumnMap` gained optional first-class
`name`/`stars`(float)/`review_count`(int) plus a generic display-only
`attributes` bag; `_read_source` attaches them only when mapped, so existing
datasets (philadelphia, toronto) keep a byte-identical record shape. Registered
`philadelphia-cuisine` + `new-orleans` via source-discovery functions.
`_point()` in pattern_query.py now additively emits those fields, so
query_instance's origin and grouped neighbours carry name/rating/attributes.

A code-reviewer pass returned no logic bug. Fixed two latent findings it (and
kongming) predicted: the prepared-cache fingerprint ignored record schema, so a
future _read_source shape change over an unchanged source could serve stale
records — added `_RECORD_SCHEMA_VERSION` to the fingerprint; and mapped display
columns weren't existence-validated, so a mis-mapping degraded to silent
all-None — now validated loudly at prepare (lat/lon/identifier keep their
historical tolerance). Full backend suite green: 76 passed, +3 new tests
(display-fields absent-unless-mapped, carried+typed+missing→None, query_instance
neighbour carries fields). kongming go/no-go: GO (verified against code, reran
the suite itself).

## Decision

- Additive-only contract: new keys on /instances and query_instance; a missing
  attribute serialises as null, never "No"/"false". Investor/Mining endpoints and
  the miner CSV are untouched.
- Documented the ε=100 m co-location cap: query_instance neighbours can never
  exceed the mining ε, so the Phase-4 discovery-radius slider has two roles —
  filter displayed POI pins (any radius) vs. narrow co-location grouping (ε-bound).

## Next steps

- Phase 4 (separate clean Explorer frontend). Kickoff decisions to lock:
  default-clamp the discovery-radius slider to the job's ε (option A, safest for
  a demo — a wide circle with a near-empty cluster list reads as "found nothing");
  legend must read the actual job eps_m, not a hardcoded 100; re-run
  `pytest server/tests -k datasets` after any source-CSV edit.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
