---
phase: 3
title: "Backend: datasets + attributes (reuse click-POI)"
status: pending
priority: P1
effort: "1-2d"
dependencies: [2]
---

# Phase 3: Backend — datasets + attributes (reuse click-POI recommendations)

## Overview
Register the two cuisine datasets and carry display attributes from packaged data through
to the API, so the existing **click-a-POI** path (`instance_recommendations`) already
answers "what co-located neighbours are around this POI?". **No new endpoint, no new
mining** — the standard job flow and Investor/Mining endpoints are unchanged. (Locked
decision: reuse click-POI, not an arbitrary-point `/explore`.)

## Requirements
- Functional:
  1. Register `philadelphia-cuisine` + `new-orleans` as packaged datasets (per-city map
     centre from the Phase-2 manifest).
  2. Extend `ColumnMap` + `_read_source` to preserve display attributes on each instance
     record so `GET /api/datasets/{id}/instances` returns them.
  3. Ensure `instance_recommendations` (the click-POI response) exposes per-neighbour
     `distance_m` + `stars` + `attributes` so the Explorer can render distance + rating +
     popup with no new endpoint. Add fields to the response payload only if missing;
     do NOT change the recommendation logic itself.
- Non-functional: no new mining path; the discovery radius is a **client-side** filter
  (Phase 4) and never reaches the backend. `instance_recommendations` still runs at
  `job.params.eps_m` (pattern adjacency) exactly as today.

## Architecture
- **Dataset registration**: `server/datasets.py` — mirror the existing
  `_philadelphia_source()` discovery pattern (datasets.py:96,130-147) with
  `_philadelphia_cuisine_source()` + `_new_orleans_source()`; extend the `ColumnMap`
  (datasets.py:37-45) with optional attribute columns and preserve them in the instance
  record inside `_read_source` (datasets.py:224-269, which today keeps only
  feature/x/y/lat/lon/id). Per-city map centre from the manifest.
- **Attributes passthrough**: attributes ride on the instance dicts produced by
  `_read_source`, so both `/instances` and any code path that reads instances (including
  the click-POI recommendation assembly in `recommendation.py`) can surface them. Missing
  value MUST serialise as explicit null/"unknown", never "No".
- **Click-POI response**: confirm `instance_recommendations` (main.py:268-296 →
  `recommend_for_point` recommendation.py:173-254) returns, per recommended neighbour:
  id/name, feature, `distance_m`, `stars`, `review_count`, `attributes`, plus the
  supporting pattern (feature list). Add only the missing display fields to the response
  serialisation; keep the ranking/selection logic intact so Investor/Mining is unaffected.
- **No `/explore`**: the arbitrary-point endpoint from the earlier draft is intentionally
  dropped. Discovery = the user clicks a POI on the Explorer map.

## Related Code Files
- Modify: `server/datasets.py` (ColumnMap + `_read_source` attribute passthrough; register 2 datasets)
- Modify: `server/recommendation.py` / `server/main.py` ONLY if the click-POI response is
  missing `distance_m`/`stars`/`attributes` for a neighbour — add display fields, do not
  alter `recommend_for_point` selection logic
- Reference: `server/pattern_query.py:22-93` (SpatialGrid.within, PatternIndex, describe_pattern),
  `server/datasets.py:96,130-147` (source-discovery pattern), `server/main.py:268-296`
- Tests: `server/tests/` (extend test_datasets.py for attributes; test_recommendation.py for display fields)

## Implementation Steps
1. Extend `ColumnMap`/`_read_source` to carry attributes; verify `/instances` returns them
   (missing = null).
2. Register the two cuisine datasets (`_philadelphia_cuisine_source`, `_new_orleans_source`);
   confirm `/api/datasets` lists them with per-city map centre.
3. Inspect the `instance_recommendations` response; add `distance_m`/`stars`/`review_count`/
   `attributes` per neighbour if absent (serialisation only).
4. Confirm Investor/Mining endpoints + outputs unchanged (existing tests green).

## Success Criteria
- [ ] `/api/datasets/{city}/instances` returns per-POI attributes (missing = null, never "No").
- [ ] Both cuisine datasets registered with correct per-city map centre.
- [ ] Clicking a POI (`instance_recommendations`) yields co-located neighbours each with
      distance + rating + attributes + supporting pattern (feature list) — no new endpoint.
- [ ] No new mining path added; discovery radius never reaches the backend.
- [ ] Investor/Mining endpoints and outputs unchanged (existing tests still green).

## Risk Assessment
- **Risk:** `instance_recommendations` today may not carry `distance_m` or attributes in its
  payload. Signal: the click-POI response lacks fields the popup needs. Response: add them at
  the serialisation layer (they already exist on the instance records after step 1); do not
  touch the selection/ranking logic.
- **Risk:** attribute columns bloat `_read_source` and slow `/instances`. Signal: instances
  endpoint noticeably slower on the larger city. Response: keep attributes as a compact dict
  per record; lazy-load hours parsing to request time (Phase 4 "open now").
- **Assumption:** click-POI reuse fully satisfies the discovery outcome (locked decision B).
  Breaks only if the thesis later needs true arbitrary-point exploration — then add a
  sibling `explore_around_point` reusing the same present-mask logic; out of scope here.
