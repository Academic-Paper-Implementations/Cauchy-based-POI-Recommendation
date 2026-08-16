---
phase: 2
title: "New cuisine extraction pipeline (Philadelphia + New Orleans)"
status: pending
priority: P1
effort: "3-4d"
dependencies: [1]
---

# Phase 2: New cuisine extraction pipeline

> **Phase-1 locked budget (2026-08-16):** ~**20** cuisine features/city, **ε = 100 m**,
> **min_prev = 0.2**. 25–30 features is INFEASIBLE on Philadelphia (engine wall). Size the
> intentful vocabulary to ~20, fitting the rare-signature cuisines (Cheesesteaks/Phil,
> Cajun-Creole/NOLA) inside that budget by swapping out a high-count common cuisine. Bake
> ε=100 / min_prev=0.2 as the packaged datasets' default mining params. Evidence:
> [phase-01-feasibility-results.md](./phase-01-feasibility-results.md).

## Overview
Production pipeline that lives IN spatial_web: read raw `business.json`, build a
fine-grained **cuisine** vocabulary per city (single-label most-specific, floor ≥ 30,
size = Phase-1 locked budget), and emit two packaged datasets (Philadelphia,
New Orleans) shaped exactly like `server/data/philadelphia/spatial_instances.csv`
— PLUS the display attributes the explorer popup needs.

## Requirements
- Functional: produce `server/data/{philadelphia,new-orleans}/spatial_instances.csv`
  with columns the miner + explorer need; write a per-city `manifest`/vocabulary note.
- Data: feature = fine-grained cuisine from Yelp `categories` (cuisines ARE present as
  categories — Italian, Chinese, Cajun/Creole, …, confirmed in EDA v2); single-label
  = lowest-global-count in-vocabulary tag (most-specific proxy); per-city floor ≥ 30;
  vocabulary ≤ Phase-1 budget, chosen with intent (common + a few rare-signature
  cuisines: Cheesesteaks/Phil, Cajun-Creole/NOLA).
- Non-functional: deterministic, re-runnable, reads raw only from `data/yelp_raw/`.
- **Attributes**: carry `stars, review_count, is_open, price (RestaurantsPriceRange2),
  hours, RestaurantsTakeOut, RestaurantsDelivery, OutdoorSeating, GoodForKids, Alcohol,
  WiFi, Ambience` into the packaged CSV (or a sibling `business_attributes.csv` keyed by
  business_id). Missing value MUST serialize as explicit "unknown"/null, never "No".

## Architecture
- New module under `server/` (e.g. `server/extract/` — a real boundary, mirrors the
  old `POI_recommend/extract` role but self-contained here). Keep it a CLI script.
- Projection: reuse `server/upload.py::project_local` (local equirectangular,
  `EARTH_RADIUS_M`). **Per-city centre → two datasets** (Phil and NOLA are far apart;
  a shared centre would distort). Do NOT invent a new projection.
- Packaged CSV columns (superset of what datasets.py reads today, so the miner path is
  unchanged): `instance_id, business_id, Feature, InstanceID, category, latitude,
  longitude, X, Y, city, state, stars, review_count, is_open` + attribute columns.
- Old pipeline reference (do not import; reimplement cleanly): category selection was
  `top-N by frequency` + `first-match` single-label + drop-unassigned
  (`POI_recommend/extract/prepare_yelp_recommender.py:223-250,712-800`). New rules
  differ: cuisine vocab + most-specific + floor ≥ 30.

## Related Code Files
- Create: `server/extract/build_cuisine_dataset.py` (+ `__init__.py`)
- Create: `server/data/philadelphia-cuisine/spatial_instances.csv` (new dataset id, do
  NOT overwrite the existing `server/data/philadelphia/`), `server/data/new-orleans/…`
- Reference: `server/upload.py:44-62`, `server/datasets.py:130-147,224-269`,
  `server/data/philadelphia/spatial_instances.csv` (column shape)
- EDA v2 scratch scripts are GONE (ephemeral scratchpad): re-implement the vocabulary
  logic (most-specific + floor + κ) here from the verified rules; do not assume a
  reusable `eda_v2_vocab_city.py` on disk. The EDA *numbers* remain as targets only.

## Implementation Steps
1. Implement the vocabulary logic in the module (rebuilt, not factored from scratch code):
   global counts, food/leisure relevance filter, most-specific single-label, per-city
   floor ≥ 30. Cross-check output against the verified EDA numbers as a sanity target.
2. Freeze the intended vocabulary per city (≤ Phase-1 budget) — common + rare-signature
   cuisines; write it to a per-city vocabulary note for the thesis (objective criteria).
3. Project lat/lon → X/Y per city; emit packaged `spatial_instances.csv` (+ attributes).
4. Emit a manifest per city: counts, κ (engine formula, on the single-label features),
   vocabulary, projection centre, source hash.
5. Dry-run datasets.py against the new files to confirm the miner path parses them.

## Success Criteria
- [ ] Two packaged datasets exist; feature = cuisine; every feature has ≥ 30 instances.
- [ ] Vocabulary size ≤ Phase-1 locked budget for BOTH cities.
- [ ] Attributes present per business; missing serialized as unknown/null (not "No").
- [ ] κ recorded per city (engine formula, single-label); Phil > NOLA as EDA predicted.
- [ ] `datasets.py` reads both without error (miner-input columns intact).

## Risk Assessment
- **Risk:** per-city floor ≥ 30 leaves NOLA with too few features (EDA: 24 ≥30) for
  interesting patterns. Signal: NOLA mines < ~5 patterns of size ≥ 3. Response: keep
  NOLA vocab as-is (rare-signature is the point), report the smaller N honestly; do NOT
  lower floor below 30 (destabilizes WPI/κ — the whole thesis contribution).
- **Risk:** most-specific = lowest-global-count mislabels multi-cuisine businesses.
  Signal: manual spot check of 20 businesses shows wrong labels. Response: switch to real
  Yelp category taxonomy tree for tie-break (carried from Phase 1 risk).
- **Assumption:** two-dataset (per-city) is right. Breaks if the thesis wants a single
  cross-city κ on one shared vocabulary — then add a THIRD packaged "shared-vocab"
  dataset for the comparison table only; keep the two per-city datasets for the app.
