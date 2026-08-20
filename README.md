# Co-location Pattern Explorer

A web app for mining spatial co-location patterns with rare-feature weighting, on
top of the thesis's **C++ clique-based miner**. Load a spatial dataset, run the
real miner, and click any point on an OpenStreetMap view to see which prevalent
patterns it participates in and which neighbours it forms them with.

There is one mining implementation in this repository: the C++ engine under
`backend/engine/`. Nothing is recomputed in JavaScript or approximated in Python.

## What it does

- **Real mining.** Maximal-clique hash-map enumeration, Cauchy rare-feature
  weighting, weighted participation index — the sequential engine from the
  thesis, vendored and documented in `backend/engine/PROVENANCE.md`.
- **Jobs, not requests.** Mining runs as a cancellable background job that
  reports the stage it has reached. Finished results are cached on disk by
  `(dataset, ε, min prevalence, sample %)` and survive a restart.
- **Map explanation.** Click an instance → the patterns it participates in →
  pick one → its co-participating neighbours light up inside the ε circle.
- **Rarity at a glance.** Every pattern row lists how many instances of each
  feature take part, with rare features' counts in red. The rare threshold is a
  percentile slider that relabels instantly and never re-mines.
- **Two views of one result.** *Mining view* is the algorithm's own evidence: κ,
  WPI, deduced patterns, the full pattern table. *Investor view* answers two
  questions from the same mined result — which feature is worth adding at a
  clicked point, and which areas suit a chosen feature. Every recommendation
  opens to show the prevalent patterns that produced its score, so it can be
  checked against the pattern table rather than taken on trust. Neither view
  re-runs the miner.
- **Your own data.** Upload a CSV, map its columns, and mine it like a packaged
  dataset.

Recommendations rank co-location support in the patterns the miner found. They
are not a forecast of commercial success, and the app says so where they appear.

## Co-located Spot Explorer

A second, separate end-user app served from its own page (`explorer.html`),
sharing the backend and the map/CRS utilities but none of the research UI. It is
framed as **discovery** — "what kinds of places cluster around here" — never
next-POI **prediction** (the committee dropped POI top-k).

Flow: pick a city, run a co-location search (the same mining job, with a plainly
labelled *search distance* and *how-common* threshold), then click a place on the
map to see the kinds of spots co-located around it, grouped by pattern, each with
distance, rating, and an attributes popup. Co-location is the silent ranking
engine; the rare/WPI/κ vocabulary stays in the research app.

**Two distances, kept apart.** The mining **search distance** (ε) defines what
counts as co-located and re-mines when changed. The **discovery radius** is a
view-only slider that filters which nearby places are shown; it is clamped to the
mined ε (co-located groups cannot exist beyond it), is never sent to the miner,
and never triggers a re-mine.

**Datasets.** The Explorer uses two packaged cuisine datasets (see the table
below and `backend/data/README.md` for how to regenerate them). Attributes
(price, takeout, hours, …) are display-only and never enter mining; a missing
attribute is shown as unknown, never as "No"; permanently-closed places are hidden.

**Extensibility (designed, not built).** A future evaluation module would be a
sibling that reads the same cached mine result (patterns / instances / params)
the Explorer reads. That cached result carries no Explorer UI state (the selected
place, the discovery radius, popup toggles), so the seam is already clean. No
evaluation code ships yet, and the baseline is deliberately undecided.

## Quick start

Requires Node 20+, Python 3.10+, and a C++17 compiler.

```bash
# 1. Build the miner (from the repo root)
mkdir -p backend/engine/bin
g++ -O2 -std=c++17 backend/engine/src/*.cpp -Ibackend/engine/include \
    -o backend/engine/bin/colocation_miner        # add .exe on Windows

# 2. Install dependencies
(cd frontend && npm install)                       # Node app lives in frontend/
python -m venv .venv && .venv/bin/pip install -r backend/requirements.txt

# 3. Run both (Vite proxies /api to the API)
cd frontend && npm run dev:all                     # dev:all lives in frontend/
# research app http://localhost:5173/ · Explorer http://localhost:5173/explorer.html
# API http://localhost:8000
```

Single-process production run:

```bash
(cd frontend && npm run build)          # emits frontend/dist
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000   # from repo root
# everything on http://localhost:8000
```

## Docker

```bash
docker build -t colocation-app .
docker run -p 8000:8000 -v colocation-cache:/app/backend/runtime colocation-app
```

The image builds the SPA, compiles the miner, and serves both from port 8000.

**Mount the volume.** `/app/backend/runtime` holds prepared datasets and the
mining result cache. A single run can take minutes; without the volume every
container restart throws those results away.

## Datasets

| Dataset | Packaged | Coordinates | Notes |
|---|---|---|---|
| Philadelphia (Yelp POI) | yes | lat/lon + metres | 9,928 businesses, 20 categories, research app |
| Philadelphia (cuisine) | yes | lat/lon + metres | ~5,700 places, 20 fine-grained cuisines + attributes, Explorer |
| New Orleans (cuisine) | yes | lat/lon + metres | ~2,400 places, 19 cuisines + attributes, Explorer |
| Toronto | no | metres only | Verification fixture, flat-CRS view with no tiles; found via the sibling repository if present |

Toronto pins the engine's numbers: ε = 120 m, min prevalence = 0.2 must give
κ = 7.8580 and **647** patterns with sizes `{2:108, 3:214, 4:202, 5:97, 6:24, 7:2}`.
See `backend/data/README.md` for how each is located.

## Controls, and what they cost

| Control | Cost |
|---|---|
| Rare threshold (percentile) | Instant — labelling only, computed from feature counts |
| ε (neighbour distance) | Re-mines |
| Min prevalence | Re-mines |

Min prevalence is **not** a post-filter. The miner accepts subsets of a prevalent
pattern through Lemma 2 without computing a WPI for them, so filtering a
low-threshold result at a higher threshold would silently drop patterns that have
no WPI to compare. Both parameters therefore sit behind one *Run mining* button.

## Runtime, measured

Philadelphia, 9,928 instances, min prevalence 0.2, on one core:

| ε | Total | Patterns |
|---|---|---|
| 40 m | 0.7 s | 27 |
| 60 m | 2.2 s | 80 |
| 80 m | 7.3 s | 175 |
| 100 m | 63 s | — |
| 120 m | 186 s | — |
| 150 m | > 20 min, aborted during clique enumeration | — |

The default ε is 80 m for that reason. Higher values work, but plan for the wait
— and the disk cache makes the second run instant. Toronto at ε = 120 m takes
about 44 s (21 s cliques, 19 s mining).

**Clique core upgraded to Fast-BK (2026-08-19).** The maximal-clique enumeration
is now the Fast-BK hybrid (degeneracy ordering + a BK-RCD / BK-Pivot switch; see
`backend/engine/PROVENANCE.md` item 8). The mined patterns are unchanged — the raw
clique set was proven byte-for-byte identical to the old BK-Pivot on Toronto,
Philadelphia, Philadelphia-cuisine and New Orleans plus a synthetic graph, and
Toronto still gives κ = 7.8580 with 647 patterns. The table above is the original
BK-Pivot baseline. On a same-machine head-to-head the new clique stage is faster
(Philadelphia at ε = 100 m: 14.4 s vs 20.0 s for BK-Pivot, identical cliques), and
ε = 150 m — which BK-Pivot could not finish — now completes (≈ 65 min total on that
run, still dominated by clique enumeration on the very dense graph).

In Docker the same work is modestly slower: ε = 60 m takes 3.1 s in the container
against 2.2 s on the host, with identical results (80 patterns, κ = 3.4626).

## Known limits

- **Map tiles need the internet.** OpenStreetMap tiles are fetched from
  `tile.openstreetmap.org`; no tiles are bundled. A dataset with no lat/lon is
  drawn on `L.CRS.Simple` in its own metres, with no tiles, and works offline.
- **Upload projection is local.** Latitude/longitude are projected with a flat
  local projection around the dataset's own centre, which is accurate at city
  scale and drifts across very large extents.
- **One job at a time.** Starting a new mining job cancels the running one. The
  scope here is a single-user thesis demo.
- **Upload limits.** 20 MB per file, 50,000 instances, and 64 distinct features,
  rejected with a clear message rather than a hang. The feature limit is the real
  one: clique enumeration grows combinatorially with the feature count, so a
  wider file does not mine slowly, it does not finish.
- **Area recommendations approximate the ε neighbourhood.** A cell counts a
  feature as present if it or any of its eight neighbours holds one — a 3×3 block
  rather than a circle. It is deliberate, generous rather than strict, and far
  cheaper than a radius query per cell.

## API

```
GET    /api/health
GET    /api/datasets
GET    /api/datasets/{id}/instances
POST   /api/jobs                       {dataset_id, eps_m, min_prev, sample_pct}
GET    /api/jobs/{id}
DELETE /api/jobs/{id}
GET    /api/jobs/{id}/result?rare_percentile=&rare_min_count=
GET    /api/jobs/{id}/instances/{feature}/{number}
GET    /api/jobs/{id}/instances/{feature}/{number}/recommendations
GET    /api/jobs/{id}/site-recommendations?feature=&top=
POST   /api/uploads                    multipart: file + column mapping
DELETE /api/cache
```

Both recommendation routes read a finished result and never re-run the miner.
Measured on the real datasets: site recommendations p95 10 ms on Philadelphia at
ε = 80 m (175 patterns) and 36 ms on Toronto at ε = 120 m (647 patterns); point
recommendations p95 2.6 ms and 5.2 ms.

## Tests

```bash
.venv/bin/pip install -r backend/requirements-dev.txt
.venv/bin/python -m pytest backend/tests          # from repo root
(cd frontend && npm test)
(cd frontend && npm run lint)
```

The Python suite covers identity mapping through the miner CSV, BOM-free config
writing, job cancellation with no orphaned process, the disk cache, rare
labelling, instance queries, recommendation scoring and region clustering,
uploads, and the projection checked against Philadelphia's own X/Y columns.

The Vitest suite covers the poll state machine, the rare-threshold debounce and
its stale-response guard, both recommendation panels, and the coordinate adapter
that separates the two CRS paths. For the Explorer it covers the attribute popup
(a missing attribute is never shown as "No"), the discovery-radius clamp, the
mining-request guard that proves the discovery radius never reaches a mine, and a
tripwire that fails the build on any next-POI prediction wording.

## Layout

```
backend/               Python FastAPI app + vendored C++ miner
  main.py            FastAPI app: datasets, jobs, results, uploads, SPA mount
  datasets.py        registry, miner CSV conversion, identity mapping
  mining_job.py      job lifecycle, subprocess, disk cache, cancellation
  rare_labeling.py   percentile threshold with a floor
  pattern_query.py   instance -> patterns -> co-participating neighbours
  recommendation.py  feature bitmasks, cell scoring, region flood fill
  upload.py          CSV validation and local projection
  extract/           build the packaged cuisine datasets from raw Yelp business.json
  engine/            vendored C++ miner (see PROVENANCE.md)
  tests/             pytest suite
frontend/              Vite + React app (all Node tooling: package.json, configs)
  index.html         research app entry
  explorer.html      Explorer app entry (separate page, same backend)
  vercel.json        Vercel build config (set project Root Directory = frontend)
  src/
    App.jsx          research app: map, controls, job, both view modes
    explorer/        Explorer app: city search, click-POI groups, popup, view radius
    hooks/           use-mining-job: submit, poll, result, rare threshold
    components/      leaflet-map (both CRS) and the mining/investor panels
    utils/           feature colours, coordinate adapter for the two CRS
```

**Deploying to Vercel:** the frontend is a static build. In the Vercel project
settings, set **Root Directory = `frontend`** so Vercel runs `npm run build`
there and serves `frontend/dist`.
