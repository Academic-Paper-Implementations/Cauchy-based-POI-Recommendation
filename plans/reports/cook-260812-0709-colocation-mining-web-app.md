# Cook report — Colocation Mining Web App

Plan: [`plans/260812-0053-colocation-mining-web-app/plan.md`](../260812-0053-colocation-mining-web-app/plan.md)
Date: 2026-08-12 · Branch: `master` · All 4 phases executed.

## Outcome

`spatial_web` is now a co-location mining app driven by the thesis C++ miner. POI
recommendation is gone. One screen: pick dataset → set ε and min prevalence → run
a cancellable job → OSM map + pattern table → click a point to see its patterns
and co-participating neighbours.

**All 9 plan success criteria verified**, including Docker (closed after the
hypervisor fix — see below).

## What was built

| Phase | Deliverable |
|---|---|
| 1 | `server/engine/` — vendored C++ miner: paper formulas (mean pairwise-ratio κ, Cauchy RI), portable memory probe, JSON instance-level output, loud failure on missing config/dataset, atomic result publishing |
| 2 | `server/{datasets,mining_job,rare_labeling,pattern_query}.py` + rewritten `main.py` — dataset registry with identity mapping, job runner with disk cache and process-tree cancellation, percentile rare labelling, instance→pattern→neighbour queries |
| 3 | `src/App.jsx` + `components/{mining-map,mining-controls,job-progress,pattern-list,instance-detail}.jsx` — Leaflet OSM map, Plotly scatter fallback, per-feature counts with rare in red |
| 4 | `server/upload.py`, rewritten `DataUpload.jsx`, 3-stage `Dockerfile`, rewritten `README.md` |

## Verification

**Engine correctness (the fixture that matters).** Toronto ε=120 m, minprev=0.2 →
κ = 7.857958, **647 patterns**, sizes `{2:108, 3:214, 4:202, 5:97, 6:24, 7:2}`.
Exact match, both from the binary and through `POST /api/jobs`.

**Runtime, measured on Philadelphia** (9,928 instances, minprev 0.2, one core):

| ε | 40 m | 60 m | 80 m | 100 m | 120 m | 150 m |
|---|---|---|---|---|---|---|
| total | 0.7 s | 2.2 s | 7.3 s | 62.9 s | 185.8 s | **>20 min, aborted** |

→ default ε set to **80 m**; `percentage_instances` stays 1.0 (Decision 3 held).

**Clique vs mine split is not stable**: 11–26 % clique on Philadelphia at ε≤80 m,
52 % on Toronto at ε=120 m, ~100 % at ε=150 m (combinatorial blow-up). → **do not
cache cliques by ε**; the disk result cache already covers the repeat case
(re-run: 0.03 s).

**Other checks**
- Cancel mid-run: `colocation_miner.exe` gone from the OS process table, no cache
  entry left, `/result` → 409.
- Q1 Philadelphia = 193.75 → 5 rare features. Moving the slider relabels with no
  new miner invocation.
- Uploads through the real HTTP endpoint: lat/lon projected server-side then
  mined; X/Y-only registered as scatter then mined; bad mappings → 400 with the
  offending column named.
- Projection sanity: distances from self-projected Philadelphia lat/lon match its
  own X/Y columns within **<1 %**.
- UI driven in a real browser: map renders 9,928 points on OSM tiles, clicking a
  point centres the map, draws the ε circle, highlights co-participants, dims the
  rest; Toronto falls through to the scatter branch.
- **51 backend tests pass**; `npm run lint` and `npm run build` clean; engine
  builds warning-free with `-Wall -Wextra`.

## Deliberate deviations from the plan

1. **Deleted more dead code than Phase 3 listed** — `DeltaConfiguration`,
   `GaussianKernelVisualization`, `PatternAnalysis`, `PatternComparison`,
   `DataContext`, `spatialAnalysis.js`, `App.css`. These were a *second,
   JavaScript* co-location miner; keeping them leaves two disagreeing engines.
2. **Raw Leaflet, `react-leaflet` removed** — 10k markers created once then
   restyled, instead of a layer rebuilt on every highlight.
3. **Single-step upload** — preview and column mapping done in-browser with
   `papaparse` (already a dependency), file + mapping posted in one request.
   Size and instance limits still enforced server-side.
4. **New `report_writer.{h,cpp}`** — platform memory probe, text report, and JSON
   writer split out of `main.cpp`.
5. **Process-tree kill on cancel** (`taskkill /T`, `killpg`) rather than
   `terminate()` on the direct child only.
6. **Plotly lazy-loaded** — main bundle 5.3 MB → 386 kB.

## Findings from self-review (fixed)

Not delegated to `code-reviewer`: this session's rules forbid spawning subagents.
Reviewed inline; two genuine defects found and fixed, one concern measured and
rejected.

- `onSelect` changed identity on every 1 s job poll → ~10k markers rebuilt and
  `fitBounds` refired every second, fighting the user's pan/zoom. Stabilised with
  a ref (`src/App.jsx`).
- Two concurrent `POST /api/jobs` could each cancel-then-start, orphaning the
  first new miner. `submit()` now serialised behind its own lock; concurrency
  test added.
- *Rejected on evidence*: an in-memory parsed-result cache. Toronto's 4.3 MB JSON
  parses in 58 ms — not worth the extra state.

Also fixed while verifying: red removed from the feature palette (it collided
with the red reserved for rare counts), and page `<title>`.

## Docker — closed after a host fix

Initially blocked. Diagnosis: `VirtualMachinePlatform`, the WSL feature, and
BIOS VT-x were **all already enabled**; the real cause was
`hypervisorlaunchtype = Off` in BCD, which keeps the hypervisor from starting at
boot and takes WSL2 and Docker Desktop down with it. WSL's error message blames
Virtual Machine Platform, which sends you the wrong way.

Fixed with `bcdedit /set hypervisorlaunchtype Auto` (user-approved) + reboot.
Reversible with `... hypervisorlaunchtype Off`.

Verified in the container afterwards:

- `docker build -t colocation-app .` — three stages, success.
- `docker run -p 8000:8000 -v colocation-cache:/app/server/runtime` — SPA and
  `/api/health` both on port 8000, `miner_available: true`.
- **C++ engine's first real run on Linux**: Philadelphia ε=60 m → 80 patterns,
  κ=3.4626 — identical to the Windows numbers.
- `peak_memory_mb = 34` (non-zero) → the `/proc/self/status` VmHWM branch works
  at runtime, not merely compiles.
- Only Philadelphia in the image; Toronto correctly absent.
- Cache works inside the container (`from_cache=true`, 0.02 s), instance query
  returns neighbours with distances.
- Container is slightly slower than the host, as predicted: 3.1 s vs 2.2 s at
  ε=60 m.

## State

- Nothing committed — the whole tree is still untracked on `master` (70 files).
- `server/runtime/` (prepared datasets, cache) and `.venv/` are git-ignored.
- `server/data/philadelphia/spatial_instances.csv` (1.8 MB) added deliberately as
  the packaged dataset.
- No background processes left running.

## Unresolved questions

1. Commit now, or review the diff first? Nothing has been committed.
2. `deduced` came out empty on Toronto — every one of the 647 patterns had a real
   WPI, because the queue reaches Lemma-2 subsets by another path anyway. The
   flag and its UI marker are implemented and correct, but if the thesis wants to
   *show* deduced patterns, a dataset/parameter pair where they survive still
   needs finding.
3. Is 50,000 instances the right upload ceiling? Chosen from the ε-vs-runtime
   curve, not from a stated requirement.
