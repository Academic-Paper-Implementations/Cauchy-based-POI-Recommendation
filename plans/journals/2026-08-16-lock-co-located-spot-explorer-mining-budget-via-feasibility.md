---
title: Lock co-located spot explorer mining budget via feasibility spike
date: 2026-08-16
summary: Phase 1 sweep locked ~20 cuisine features/city at eps=100m; 25-30 infeasible on Philadelphia
---

# Lock co-located spot explorer mining budget via feasibility spike

## What happened

Finished planning the second end-user app (co-located spot explorer) under a
deep validation pass, then executed the feasibility spike that de-risks the
whole effort.

Verified the drafted plan against the real codebase (every cited symbol exists:
`recommend_for_point`, `instance_recommendations`, `ColumnMap`, `SpatialGrid`,
`project_local`, leaflet/crs utils). Red-team caught two real defects: a broken
brainstorm link (`colocated` vs `colocation`) and a dangling "reuse EDA v2 logic"
reference — the EDA scratch scripts are gone (ephemeral scratchpad), only the
numbers survive, so the vocabulary logic must be rebuilt in Phase 2.

Ran the throwaway spike: streamed raw `business.json`, built cuisine-labelled
miner CSVs (most-specific single-label, floor >= 30), and swept
(feature_count x eps x min_prev) against the real vendored C++ miner with a
150 s wall-clock timeout.

Result: the miner is far more expensive on cuisine density than hoped. On
Philadelphia (the binding constraint) only three cells finish under 150 s:
(20,80)=39 s, (20,100)=107 s, (25,80)=102 s. Everything at eps>=120, or N>=25 at
eps>=100, or N>=30 at eps=80, times out. New Orleans (smaller) is much faster.
Locked the richest budget that finishes on BOTH cities: ~20 features/city,
eps=100 m, min_prev=0.2 (Phil 107 s with 95 triples + 4 quads; NOLA 4 s).

## Decision

- Locked mining budget: ~20 cuisine features/city, eps=100 m, min_prev=0.2
  (user-confirmed). The brainstorm's 25-30 feature target is INFEASIBLE on
  Philadelphia and was dropped to ~20 across the plan + acceptance criteria.
- Three plan-shaping decisions locked during validation: the explorer is a
  SEPARATE clean frontend reusing the existing backend; it keeps the standard
  mining job flow (user sets eps/threshold; "tens of minutes" is already normal
  and cached); discovery reuses click-a-POI (`instance_recommendations`) with a
  client-side radius — no new arbitrary-point endpoint. This shrank Phase 3.

## Next steps

- Phase 2: production cuisine extraction pipeline; fit the rare-signature
  cuisines (Cheesesteaks/Phil, Cajun-Creole/NOLA) inside the ~20 budget by
  swapping out a high-count common cuisine; bake eps=100/min_prev=0.2 defaults.
- Toolchain gotcha for later phases: the sandboxed git-bash cannot run g++ or the
  miner .exe (silent exit); build AND run through PowerShell with
  `C:\msys64\ucrt64\bin` on PATH so the ucrt64 runtime DLLs load.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
