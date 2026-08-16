---
phase: 3
title: "Backend: datasets + attributes (reuse click-POI)"
status: completed
priority: P1
effort: "1-2d"
dependencies: [2]
---

> ✅ **COMPLETED 2026-08-16 (kongming-advised, GO).** Registered `philadelphia-cuisine` +
> `new-orleans`; `ColumnMap`/`_read_source` carry first-class name/stars(float)/review_count(int)
> + a display-only `attributes` bag; `_point()` surfaces them on `query_instance` origin +
> `patterns[].neighbors[]`. Additive only — existing philadelphia/toronto record shape
> byte-identical, Investor/Mining + miner CSV untouched. Full backend suite green (76 passed,
> +3 new tests). Review fixes applied: schema-versioned cache fingerprint; mapped display
> columns existence-validated at prepare. Click-POI source = `query_instance` (not
> `instance_recommendations`).

# Phase 3: Backend — datasets + attributes (reuse click-POI recommendations)

> **Design correction (2026-08-16, kongming-advised).** The click-POI source is
> `query_instance` (endpoint `GET /api/jobs/{job_id}/instances/{feature}/{number}`,
> `pattern_query.py:95`), NOT `instance_recommendations`/`recommend_for_point` — the
> latter returns feature-level "what to add here" recommendations + nearby COUNTS, with no
> per-neighbour POI or distance. `query_instance` already returns `patterns[].neighbors[]`,
> each neighbour a POI with `distance_m`, grouped by pattern (= the type-cluster grouping).
> Phase 3 = carry display attributes onto instance records + into `_point()` so those
> neighbours (and `/instances`) expose name/rating/attributes. Split the fields:
> **`name` (str), `stars` (float), `review_count` (int) are first-class typed record fields;**
> `price, takeout, delivery, outdoor_seating, good_for_kids, alcohol, wifi, ambience, hours`
> stay in a generic display-only `attributes` bag. **ε cap:** `query_instance` neighbours are
> bounded by `job.params.eps_m` (locked 100 m). The Phase-4 discovery radius therefore has
> TWO roles — (a) filter displayed POI pins from `/instances` (any radius), (b) co-location
> grouping is inherently ε-bound at 100 m; the radius can only narrow grouping, never extend
> a co-location claim past 100 m. Documented in phase-04.

## Overview
Register the two cuisine datasets and carry display attributes from packaged data through
to the API, so the existing **click-a-POI** path (`instance_recommendations`) already
answers "what co-located neighbours are around this POI?". **No new endpoint, no new
mining** — the standard job flow and Investor/Mining endpoints are unchanged. (Locked
decision: reuse click-POI, not an arbitrary-point `/explore`.)

## Requirements
- Functional:
  1. Register `philadelphia-cuisine` + `new-orleans` as packaged datasets. No map-centre
     field needed — the frontend `leaflet-map.jsx` auto-fits bounds from the instances'
     lat/lon (`map.fitBounds`), so registration only needs the source + ColumnMap.
  2. Extend `ColumnMap` + `_read_source` to preserve display attributes on each instance
     record so `GET /api/datasets/{id}/instances` returns them.
  3. Extend `_point()` (`pattern_query.py:143`) additively so `query_instance`'s origin +
     `patterns[].neighbors[]` carry `name`, `stars`, `review_count`, `attributes`. That is
     the click-POI response the Explorer renders (distance already present as `distance_m`).
     Do NOT change grouping/selection logic; keep `recommend_for_point` for its own job.
- Non-functional: no new mining path; the discovery radius is a **client-side** filter
  (Phase 4) and never reaches the backend. `instance_recommendations` still runs at
  `job.params.eps_m` (pattern adjacency) exactly as today.

## Architecture
- **Dataset registration**: `server/datasets.py` — mirror the existing
  `_philadelphia_source()` discovery pattern (datasets.py:96,130-147) with
  `_philadelphia_cuisine_source()` + `_new_orleans_source()`; extend the `ColumnMap`
  (datasets.py:37-45) with optional attribute columns and preserve them in the instance
  record inside `_read_source` (datasets.py:224-269, which today keeps only
  feature/x/y/lat/lon/id). No map-centre field — frontend fits bounds from instances.
- **Attributes passthrough**: attributes ride on the instance dicts produced by
  `_read_source`, so both `/instances` and any code path that reads instances (including
  the click-POI recommendation assembly in `recommendation.py`) can surface them. Missing
  value MUST serialise as explicit null/"unknown", never "No".
- **Click-POI response = `query_instance`** (`pattern_query.py:95`, endpoint
  `GET /api/jobs/{job_id}/instances/{feature}/{number}`, main.py:241-265). It already
  returns `patterns[]` (grouped by feature-list), each with `neighbors[]` (co-participating
  POIs within `eps_m`, each carrying `distance_m`, sorted). Phase 3 makes `_point()` also
  emit `name`, `stars`, `review_count`, `attributes`; grouping/selection logic untouched.
- **`recommend_for_point` unchanged**: it answers "which feature is worth adding here"
  (feature-level + counts, no per-neighbour POI). Left as-is for Investor/Mining.
- **No `/explore`**: the arbitrary-point endpoint from the earlier draft is intentionally
  dropped. Discovery = the user clicks a POI on the Explorer map.

## Related Code Files
- Modify: `server/datasets.py` (ColumnMap + `_read_source` attribute passthrough; register 2 datasets)
- Modify: `server/pattern_query.py` — `_point()` (l.143) additively emits name/stars/
  review_count/attributes (flows into `query_instance` origin + neighbours)
- Reference: `server/datasets.py:96,130-147` (source-discovery pattern; `_optional_float`
  l.272), `server/pattern_query.py:95-140` (query_instance), `server/main.py:241-265`
- Tests: extend `test_datasets.py` (attribute passthrough, missing→None, existing datasets
  untouched) + `test_pattern_query.py` (neighbour carries name/stars/attributes)

## Implementation Steps
1. Extend `ColumnMap`/`_read_source` to carry attributes; verify `/instances` returns them
   (missing = null).
2. Register the two cuisine datasets (`_philadelphia_cuisine_source`, `_new_orleans_source`);
   confirm `/api/datasets` lists them (frontend fits map bounds from instances).
3. Extend `_point()` so `query_instance` origin + neighbours carry name/stars/review_count/
   attributes (additive keys only).
4. Confirm Investor/Mining endpoints + outputs unchanged (existing tests green).

## Success Criteria
- [ ] `/api/datasets/{city}/instances` returns per-POI attributes (missing = null, never "No").
- [ ] Both cuisine datasets registered and listed by `/api/datasets` (map framing is
      the frontend's job via fitBounds — no registration map-centre needed).
- [ ] Clicking a POI (`query_instance`) yields co-located neighbours each with distance +
      rating (stars) + attributes, grouped by pattern (feature list) — no new endpoint.
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
