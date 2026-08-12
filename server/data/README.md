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
