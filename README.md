# Co-location Pattern Explorer

A web app for mining spatial co-location patterns with rare-feature weighting, on
top of the thesis's **C++ clique-based miner**. Load a spatial dataset, run the
real miner, and click any point on an OpenStreetMap view to see which prevalent
patterns it participates in and which neighbours it forms them with.

There is one mining implementation in this repository: the C++ engine under
`server/engine/`. Nothing is recomputed in JavaScript or approximated in Python.

## What it does

- **Real mining.** Maximal-clique hash-map enumeration, Cauchy rare-feature
  weighting, weighted participation index — the sequential engine from the
  thesis, vendored and documented in `server/engine/PROVENANCE.md`.
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

## Quick start

Requires Node 20+, Python 3.10+, and a C++17 compiler.

```bash
# 1. Build the miner
mkdir -p server/engine/bin
g++ -O2 -std=c++17 server/engine/src/*.cpp -Iserver/engine/include \
    -o server/engine/bin/colocation_miner        # add .exe on Windows

# 2. Install dependencies
npm install
python -m venv .venv && .venv/bin/pip install -r server/requirements.txt

# 3. Run both (Vite proxies /api to the API)
npm run dev:all
# frontend http://localhost:5173 · API http://localhost:8000
```

Single-process production run:

```bash
npm run build
python -m uvicorn server.main:app --host 0.0.0.0 --port 8000
# everything on http://localhost:8000
```

## Docker

```bash
docker build -t colocation-app .
docker run -p 8000:8000 -v colocation-cache:/app/server/runtime colocation-app
```

The image builds the SPA, compiles the miner, and serves both from port 8000.

**Mount the volume.** `/app/server/runtime` holds prepared datasets and the
mining result cache. A single run can take minutes; without the volume every
container restart throws those results away.

## Datasets

| Dataset | Packaged | Coordinates | Notes |
|---|---|---|---|
| Philadelphia (Yelp POI) | yes | lat/lon + metres | 9,928 businesses, 20 categories, OpenStreetMap view |
| Toronto | no | metres only | Verification fixture, flat-CRS view with no tiles; found via the sibling repository if present |

Toronto pins the engine's numbers: ε = 120 m, min prevalence = 0.2 must give
κ = 7.8580 and **647** patterns with sizes `{2:108, 3:214, 4:202, 5:97, 6:24, 7:2}`.
See `server/data/README.md` for how each is located.

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
.venv/bin/pip install -r server/requirements-dev.txt
.venv/bin/python -m pytest server/tests
npm test
npm run lint
```

The Python suite covers identity mapping through the miner CSV, BOM-free config
writing, job cancellation with no orphaned process, the disk cache, rare
labelling, instance queries, recommendation scoring and region clustering,
uploads, and the projection checked against Philadelphia's own X/Y columns.

The Vitest suite covers the poll state machine, the rare-threshold debounce and
its stale-response guard, both recommendation panels, and the coordinate adapter
that separates the two CRS paths.

## Layout

```
server/
  main.py            FastAPI app: datasets, jobs, results, uploads, SPA mount
  datasets.py        registry, miner CSV conversion, identity mapping
  mining_job.py      job lifecycle, subprocess, disk cache, cancellation
  rare_labeling.py   percentile threshold with a floor
  pattern_query.py   instance -> patterns -> co-participating neighbours
  recommendation.py  feature bitmasks, cell scoring, region flood fill
  upload.py          CSV validation and local projection
  engine/            vendored C++ miner (see PROVENANCE.md)
src/
  App.jsx            single screen wiring map, controls, job, both view modes
  hooks/             use-mining-job: submit, poll, result, rare threshold
  components/        leaflet-map (both CRS) and the mining/investor panels
  utils/             feature colours, coordinate adapter for the two CRS
```
