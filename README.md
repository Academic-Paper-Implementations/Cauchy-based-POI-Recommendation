# Co-located Spot Explorer

A web app for **discovering which kinds of places cluster together**, on top of
the thesis's **C++ clique-based co-location miner**. Pick a city, run the real
miner, and click any place on an OpenStreetMap view to see the kinds of spots
that co-locate around it — grouped by the pattern they belong to, each with
distance, rating, and an attributes popup.

There is one mining implementation in this repository: the C++ engine under
`backend/engine/`. Nothing is recomputed in JavaScript or approximated in Python.

It is framed as **discovery** — "what kinds of places cluster around here" —
never next-POI **prediction**. Co-location is the silent ranking engine; the
rare / WPI / κ vocabulary of the algorithm stays under the hood.

## What it does

- **Real mining.** Maximal-clique hash-map enumeration (Fast-BK hybrid), Cauchy
  rare-feature weighting, weighted participation index — the sequential engine
  from the thesis, vendored and documented in `backend/engine/PROVENANCE.md`.
- **Jobs, not requests.** Mining runs as a cancellable background job that
  reports the stage it has reached. Finished results are cached on disk by
  `(dataset, ε, min prevalence, sample %)` and survive a restart.
- **Map explanation.** Click a place → the kinds of spots co-located around it,
  grouped by the mined pattern they share → they light up on the map inside the
  discovery radius.
- **Two distances, kept apart.** The mining **search distance** (ε) defines what
  counts as co-located and re-mines when changed. The **discovery radius** is a
  view-only slider that filters which nearby places are shown; it is clamped to
  the mined ε (co-located groups cannot exist beyond it), is never sent to the
  miner, and never triggers a re-mine.
- **Places, not jargon.** Each place carries its name, rating, review count, and
  a display-only attributes popup (price, takeout, hours, …). A missing attribute
  is shown as unknown, never as "No"; permanently-closed places are hidden.

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
# app http://localhost:5173/  ·  API http://localhost:8000
```

Single-process production run (the API serves the built app on one port):

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

The image builds the app, compiles the miner, and serves both from port 8000.

**Mount the volume.** `/app/backend/runtime` holds prepared datasets and the
mining result cache. A single run can take minutes; without the volume every
container restart throws those results away.

## Datasets

The Explorer uses the two packaged **cuisine** datasets. The engine's benchmark
and verification corpus (Philadelphia Yelp POI, Toronto fixture) also stays
registered on the API for measuring the miner.

| Dataset | Used by Explorer | Coordinates | Notes |
|---|---|---|---|
| Philadelphia (cuisine) | yes | lat/lon + metres | ~5,700 places, 20 fine-grained cuisines + attributes |
| New Orleans (cuisine) | yes | lat/lon + metres | ~2,400 places, 19 cuisines + attributes |
| Philadelphia (Yelp POI) | no | lat/lon + metres | 9,928 businesses, 20 categories — engine benchmark corpus |
| Toronto | no | metres only | Verification fixture; found via the sibling repository if present |

See `backend/data/README.md` for how each is located and how the cuisine
datasets are regenerated.

Toronto pins the engine's numbers: ε = 120 m, min prevalence = 0.2 must give
κ = 7.8580 and **647** patterns with sizes `{2:108, 3:214, 4:202, 5:97, 6:24, 7:2}`.

## Controls, and what they cost

| Control | Cost |
|---|---|
| Discovery radius | Instant — view-only filter, never reaches the miner |
| Search distance (ε) | Re-mines |
| How-common (min prevalence) | Re-mines |

Min prevalence is **not** a post-filter. The miner accepts subsets of a prevalent
pattern through Lemma 2 without computing a WPI for them, so filtering a
low-threshold result at a higher threshold would silently drop patterns that have
no WPI to compare. Both parameters therefore sit behind one *Run* button. The
default ε is 100 m for the cuisine datasets.

## Runtime, measured

Philadelphia (9,928 instances, min prevalence 0.2, one core) is the engine
benchmark:

| ε | Total | Patterns |
|---|---|---|
| 40 m | 0.7 s | 27 |
| 60 m | 2.2 s | 80 |
| 80 m | 7.3 s | 175 |
| 100 m | 63 s | — |
| 120 m | 186 s | — |

Higher ε works but plan for the wait — and the disk cache makes the second run
instant. Toronto at ε = 120 m takes about 44 s (21 s cliques, 19 s mining).

**Clique core: Fast-BK (2026-08-19).** The maximal-clique enumeration is the
Fast-BK hybrid (degeneracy ordering + a BK-RCD / BK-Pivot switch; see
`backend/engine/PROVENANCE.md` item 8). The mined patterns are unchanged — the raw
clique set was proven byte-for-byte identical to the old BK-Pivot on Toronto,
Philadelphia, Philadelphia-cuisine and New Orleans plus synthetic graphs, and
Toronto still gives κ = 7.8580 with 647 patterns. The table above is the original
BK-Pivot baseline; the new clique stage is faster on a same-machine head-to-head
(Philadelphia at ε = 100 m: 14.4 s vs 20.0 s, identical cliques), and ε = 150 m —
which BK-Pivot could not finish — now completes.

In Docker the same work is modestly slower: ε = 60 m takes 3.1 s in the container
against 2.2 s on the host, with identical results (80 patterns, κ = 3.4626).

## Known limits

- **Map tiles need the internet.** OpenStreetMap tiles are fetched from
  `tile.openstreetmap.org`; no tiles are bundled. A dataset with no lat/lon is
  drawn on `L.CRS.Simple` in its own metres, with no tiles, and works offline.
- **One job at a time.** Starting a new mining job cancels the running one. The
  scope here is a single-user thesis demo.
- **Feature count is the real ceiling.** Clique enumeration grows combinatorially
  with the number of distinct features, so a very wide dataset does not mine
  slowly, it does not finish. The cuisine datasets stay well inside that bound.

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
DELETE /api/cache
```

Every route reads a finished result or drives the mining job; none recompute
patterns outside the C++ engine.

## Tests

```bash
.venv/bin/pip install -r backend/requirements-dev.txt
.venv/bin/python -m pytest backend/tests          # from repo root
(cd frontend && npm test)
(cd frontend && npm run lint)
```

The Python suite covers identity mapping through the miner CSV, BOM-free config
writing, job cancellation with no orphaned process (including a concurrent
cancel-vs-submit race), the disk cache, rare labelling, instance queries, and the
grid radius query checked against a brute-force scan.

The Vitest suite covers the poll state machine, the discovery-radius clamp, the
coordinate adapter that separates the two CRS paths, the attribute popup (a
missing attribute is never shown as "No"), the search box, the guide, the
mining-request guard that proves the discovery radius never reaches a mine, and a
tripwire that fails the build on any next-POI prediction wording.

## Layout

```
backend/               Python FastAPI app + vendored C++ miner
  main.py            FastAPI app: datasets, jobs, results, SPA mount
  datasets.py        registry, miner CSV conversion, identity mapping
  mining_job.py      job lifecycle, subprocess, disk cache, cancellation
  rare_labeling.py   percentile threshold with a floor
  pattern_query.py   instance -> patterns -> co-participating neighbours, grid
  extract/           build the packaged cuisine datasets from raw Yelp business.json
  engine/            vendored C++ miner (see PROVENANCE.md)
  tests/             pytest suite
frontend/              Vite + React app (all Node tooling: package.json, configs)
  index.html         app entry (mounts src/explorer/main.jsx)
  vercel.json        Vercel build config (set project Root Directory = frontend)
  src/
    explorer/        the app: city search, click-place groups, popup, view radius
    hooks/           use-mining-job: submit, poll, result
    components/      leaflet-map (both CRS), error-boundary
    utils/           feature colours, coordinate adapter for the two CRS
    config/          api client
```

**Deploying to Vercel:** the frontend is a static build. In the Vercel project
settings, set **Root Directory = `frontend`** so Vercel runs `npm run build`
there and serves `frontend/dist`. See `docs/explorer-deployment.md` for the
backend caveat.
