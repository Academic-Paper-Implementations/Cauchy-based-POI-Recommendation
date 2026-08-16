---
phase: 1
title: "Runtime feasibility spike (feature budget lock)"
status: completed
priority: P1
effort: "1-2d"
dependencies: []
---

> ✅ **COMPLETED 2026-08-16.** Locked: **~20 cuisine features/city, ε = 100 m,
> min_prev = 0.2** (user-confirmed). Full evidence + per-cell sweep:
> [phase-01-feasibility-results.md](./phase-01-feasibility-results.md). Key result: the
> engine wall makes 25–30 features infeasible on Philadelphia — ~20 is the ceiling.

# Phase 1: Runtime feasibility spike (feature budget lock)

## Overview
De-risk the single biggest unknown FIRST: does the existing C++ clique miner finish
in acceptable time on a fine-grained cuisine vocabulary? Produce a throwaway
cuisine-labeled dataset for the worst case (Philadelphia, 71 candidate features)
and sweep feature-count × ε to LOCK a feature budget + ε + min_prev the production
pipeline (Phase 2) will target. No production code ships from this phase.

## Requirements
- Functional: build the miner; run it over a draft Philadelphia cuisine dataset at
  several (feature_count, ε, min_prev) points; record wall time, pattern count, κ,
  max pattern size, and whether the run completes vs aborts.
- Non-functional: identify the largest feature vocabulary that finishes within an
  agreed budget (proposal: ≤ 60 s at the chosen ε) with pattern sizes ≥ 3 present.

## Architecture
- Reuse the verified build + run path (README + `server/engine`). Miner is invoked
  as a subprocess with a config; do not modify engine code.
- Draft extraction is a *disposable* script (scratch), not the Phase 2 pipeline: read
  `data/yelp_raw/yelp_academic_dataset_business.json`, keep food/leisure businesses in
  Philadelphia, single-label most-specific over a candidate cuisine set, emit a
  minimal `spatial_instances`-shaped CSV (feature,id,lat,lon → project to x/y).
- Sweep grid: feature_count ∈ {20, 25, 30, 40}, ε ∈ {80, 100, 120} m, min_prev ∈ {0.2}.
  Philadelphia is the stress case (highest density + most features); confirm the
  chosen budget also runs on New Orleans (smaller) before locking.

## Related Code Files
- Create: `scratch/feasibility/*` (throwaway extraction + sweep runner; NOT shipped)
- Build only (no edits): `server/engine/src/*.cpp`, `server/engine/include/*`
- Reference (shape only): `server/data/philadelphia/spatial_instances.csv`,
  `server/upload.py` (project_local lat/lon→x/y, EARTH_RADIUS_M)

## Implementation Steps
1. Build miner: `g++ -O2 -std=c++17 server/engine/src/*.cpp -Iserver/engine/include -o server/engine/bin/colocation_miner.exe`.
2. Draft extraction for Philadelphia over the candidate cuisine vocabulary, applying the
   most-specific = lowest-global-count heuristic. NOTE: the earlier EDA v2 scratch scripts
   are gone (ephemeral scratchpad) — re-implement the heuristic here from the verified
   rules; only the EDA *numbers* (Phil κ=2.08/71 feat, NOLA κ=1.73/24 feat, 20-cuisine
   shared vocab) survive as targets, not the code.
3. Run the sweep; capture wall time, #patterns, κ, max size, completion/abort per cell.
4. Repeat the chosen (or top-2) budget on New Orleans to confirm it also finishes.
5. Record results in a short note under the plan dir; LOCK: feature budget N, ε, min_prev.

## Success Criteria
- [ ] Miner builds and runs on a cuisine-labeled Philadelphia dataset.
- [ ] A (feature_count, ε, min_prev) point is found that finishes ≤ agreed budget with
      pattern sizes ≥ 3 present, and also finishes on New Orleans.
- [ ] Locked budget recorded and referenced by Phase 2. If NO point satisfies the
      budget, escalate (see Risk) before Phase 2 starts.

## Risk Assessment
- **Risk:** no cuisine vocabulary both rich enough (has rare cuisines) and small enough
  to finish. Signal: every sweep cell either aborts or drops all size-≥3 patterns.
  Response: (a) lower ε first; (b) shrink vocabulary toward ~20 keeping a few rare
  cuisines by design; (c) if still failing, replan — reconsider whether the explorer
  groups by *pairs* (size 2) only, and tell the user before Phase 2.
- **Assumption that may break:** most-specific = lowest-global-count is a good hierarchy
  proxy. Signal: labels look wrong (e.g. everything collapses to "Burgers"). Response:
  switch to the real Yelp category taxonomy tree for tie-break in Phase 2.
