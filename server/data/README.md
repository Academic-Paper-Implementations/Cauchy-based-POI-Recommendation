# Backend data

## Philadelphia — the packaged dataset

`philadelphia/spatial_instances.csv` is the only dataset shipped with the app.
9,928 Yelp businesses in 20 categories, with both `latitude`/`longitude` and
projected `X`/`Y` in metres, so it drives the OpenStreetMap view directly.

Resolution order:

1. env `PHILADELPHIA_INSTANCES`
2. `server/data/philadelphia/spatial_instances.csv` (this folder)
3. dev fallback: `../POI_recommend/data/yelp/philadelphia/processed/spatial_instances.csv`

Source: `POI_recommend/data/yelp/philadelphia/processed/spatial_instances.csv`.

## Cuisine datasets — for the Explorer app

`philadelphia-cuisine/spatial_instances.csv` and `new-orleans/spatial_instances.csv`
power the Co-located Spot Explorer. Unlike the 20-category Philadelphia dataset,
their feature is a **fine-grained cuisine** (single most-specific label, floor ≥ 30,
~20 features per city — the Phase-1 feasible budget for the C++ miner), and each row
carries display-only attributes for the popup: `name, stars, review_count, is_open,
price, takeout, delivery, outdoor_seating, good_for_kids, alcohol, wifi, ambience,
hours`. Those attributes are never mined — only `Feature`/`X`/`Y` reach the miner —
and a missing value is written as an empty cell (shown as "unknown", never "No").

Each folder also holds a `manifest.json` recording the vocabulary, per-feature
counts, projection centre, κ, and the mining defaults (ε = 100 m, min_prev = 0.2).

Regenerate both from raw Yelp business data (business data only; no user/review
data is copied into the repo):

```bash
python -m server.extract.build_cuisine_dataset --city all
# reads data/yelp_raw/yelp_academic_dataset_business.json
```

Resolution order per city (e.g. Philadelphia cuisine):

1. env `PHILADELPHIA_CUISINE_INSTANCES` / `NEW_ORLEANS_INSTANCES`
2. `server/data/philadelphia-cuisine/spatial_instances.csv` / `server/data/new-orleans/…`

After editing a source CSV or the extractor, re-run `pytest server/tests -k datasets`:
the datasets share one attribute-column contract and registration fails loudly if a
mapped column drifts.

## Toronto — verification fixture, not packaged

`Toronto_x_y_alphabet_version_03.csv` is the fixture that pins the engine's
numbers: eps = 120 m, min_prev = 0.2 must give kappa = 7.8580 and 647 patterns.
It carries no lat/lon, so it also exercises the scatter branch of the UI.

It is **not** copied into this folder or into the Docker image. It is registered
only when found, in this order:

1. env `TORONTO_INSTANCES`
2. `server/data/toronto/Toronto_x_y_alphabet_version_03.csv`
3. dev fallback: `../A-Joinless-Approach-for-Mining-Spatial-Colocation-Patterns/data/Toronto_x_y_alphabet_version_03.csv`

## Derived files

Prepared miner input, identity mappings, job workspaces, and the mining result
cache all live under `server/runtime/`, which is generated and git-ignored. See
the README at the repository root for the Docker volume that keeps the cache
across container restarts.
