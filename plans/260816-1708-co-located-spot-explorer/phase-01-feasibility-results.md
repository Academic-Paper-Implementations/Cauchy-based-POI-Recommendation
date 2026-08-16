# Phase 1 — Runtime feasibility results & locked budget

Date: 2026-08-16
Engine: vendored C++ clique miner, rebuilt clean this session (g++ 16.1.0 ucrt64,
`-O2 -std=c++17`, exit 0). Verified same 573,265-byte deterministic binary.
Spike (throwaway, not shipped): scratchpad `feasibility_spike.py` — streams raw
`business.json`, keeps food/leisure businesses per city, most-specific single-label
(lowest global count in-vocab), projects with the `upload.py` local-equirectangular
formula, emits the exact miner CSV shape (`Feature,Instance,LocX,LocY`), runs the real
binary per (feature_count × ε × min_prev) with a wall-clock timeout.

## Toolchain note (carry to all later phases)

The sandboxed git-bash **cannot** run g++ or the miner .exe (silent exit). Build AND run
the miner through PowerShell with `C:\msys64\ucrt64\bin` prepended to PATH (the .exe needs
the ucrt64 runtime DLLs at load time). The Python sweep sets this in the subprocess env.

## Extraction (candidate vocabulary, floor ≥ 30)

| City | food/leisure businesses | cuisine tags ≥30 | top signature |
|------|------------------------:|-----------------:|---------------|
| Philadelphia | 8,346 | 126 | Sandwiches(929), Pizza(800)… Cheesesteaks present |
| New Orleans | 3,735 | 78 | **Cajun/Creole(402)**, Seafood(332), Southern(155) |

(Candidate count > EDA's 71/24 because the spike's broad-root exclusion list differs; the
worst-case direction — many features — is what Phase 1 needs. Phase 2 picks the intentful
~20 cleanly.) Effective feature counts after most-specific labelling: N=20→20 (Phil)/19
(NOLA); N=25→24; N=30→29; N=40→39. Instances: Phil 5.9k–6.9k, NOLA 2.4k–3.1k.

## Sweep (min_prev = 0.2, timeout 150 s)

**Philadelphia (binding constraint — dense):**

| N | ε | status | wall_s | κ | #patterns | max size | size_dist |
|--:|--:|--------|-------:|---:|---------:|:--------:|-----------|
| 20 | 80 | DONE | 39.1 | 1.45 | 138 | 3 | {2:133, 3:5} |
| 20 | 100 | **DONE** | **106.6** | **1.45** | **278** | **4** | {2:179, 3:95, 4:4} |
| 20 | 120 | TIMEOUT | >150 | — | — | — | — |
| 25 | 80 | DONE | 102.3 | 1.49 | 188 | 3 | {2:174, 3:14} |
| 25 | 100 | TIMEOUT | >150 | — | — | — | — |
| 30 | 80 | TIMEOUT | >150 | — | — | — | — |
| 40 | 80 | TIMEOUT | >150 | — | — | — | — |

**New Orleans (much faster — sparse):**

| N | ε | status | wall_s | κ | #patterns | max size | size_dist |
|--:|--:|--------|-------:|---:|---------:|:--------:|-----------|
| 20 | 80 | DONE | 0.9 | 1.32 | 97 | 3 | {2:96, 3:1} |
| 20 | 100 | DONE | 4.0 | 1.32 | 159 | 3 | {2:136, 3:23} |
| 20 | 120 | DONE | 10.1 | 1.32 | 327 | 4 | {2:156, 3:155, 4:16} |
| 25 | 100 | DONE | 25.9 | 1.40 | 203 | 4 | {2:186, 3:16, 4:1} |
| 25 | 120 | DONE | 64.7 | 1.40 | 393 | 4 | {2:224, 3:157, 4:12} |
| 30 | 100 | DONE | 108.2 | 1.44 | 242 | 3 | {2:232, 3:10} |
| 30 | 120 | TIMEOUT | >150 | — | — | — | — |

## Findings

1. Runtime explodes fast in BOTH ε and feature count; Philadelphia (density) is the wall.
   Past ~N20/ε100 on Phil, the miner does not finish within 150 s (matches the brainstorm
   "20 feat/ε=150 m aborted >20 min").
2. Only three Philadelphia cells finish: (20,80)=39 s, (20,100)=107 s, (25,80)=102 s.
3. κ is stable and city-ordered as EDA predicted (Phil 1.45–1.49 > NOLA 1.32–1.44), so
   the algorithm's dispersion signal holds on the cuisine vocabulary.
4. Richness needs ε≥100: at ε=80 Phil/NOLA are pair-dominated (≤14 triples); at ε=100 Phil
   yields 95 triples + 4 quads (max size 4) — the "group of 2–3 types" story is real there.

## LOCKED BUDGET ✅ (user-confirmed 2026-08-16: ε = 100 m)

**LOCKED: feature_count ≈ 20, ε = 100 m, min_prev = 0.2** (single ε for both cities).
- Philadelphia: 107 s, κ=1.45, 278 patterns (179 pairs / 95 triples / 4 quads), max size 4.
- New Orleans: 4.0 s, κ=1.32, 159 patterns (136 pairs / 23 triples), max size 3.
- Finishes on BOTH cities; richest confirmed structure; same ~20-feature vocabulary.
- The ≤60 s target the plan proposed is unnecessary given the locked decision to keep the
  standard backend job flow (`mining_job.py` already treats "tens of minutes" as normal,
  result cached per (dataset, ε, threshold)). ~110 s for a once-cached Philadelphia mine is
  acceptable.

**Strict-fast fallback: feature_count = 20, ε = 80 m, min_prev = 0.2** — 39 s on Phil, but
pair-dominated (only 5 triples). Choose only if a sub-60 s mine is a hard requirement.

**Not viable:** ε ≥ 120 on Phil at any N; N ≥ 25 at ε ≥ 100 on Phil; N ≥ 30 at ε=80 on Phil.

## Handoff to Phase 2

- Size the intentful vocabulary to **~20 cuisine features per city**, NOT 25–30. The engine
  wall makes 25–30 infeasible on Philadelphia at a useful ε.
- Phase 2 must fit the rare-signature cuisines (Cheesesteaks/Phil, Cajun-Creole/NOLA — the
  latter is already #1) INSIDE the ~20 budget by swapping out a high-count common cuisine;
  runtime is driven by feature count + density + ε, so an intentful 20 costs ~the same as a
  top-20 and the locked budget holds.
- Mining params to bake into the packaged datasets / default job: ε=100 m, min_prev=0.2.
