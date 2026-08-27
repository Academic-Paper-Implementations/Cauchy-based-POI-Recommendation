"""Download OpenStreetMap raster tiles for the demo cities into the frontend so
the map works without a live tile server (some ISPs DNS-block openstreetmap.org).

Reads every lat/lon dataset under backend/runtime/datasets, computes the union of
the tiles their bounding boxes cover for zoom levels MIN_ZOOM..MAX_ZOOM, and
saves each as frontend/public/tiles/{z}/{x}/{y}.png. Already-present tiles are
skipped, so the run is resumable. Requests are throttled to stay polite to the
mirror (bulk tile downloading is discouraged by the OSM tile usage policy; this
pack is small and for a local academic demo).

Usage (from repo root):  python backend/scripts/download_tiles.py
"""

from __future__ import annotations

import json
import math
import time
import urllib.error
import urllib.request
from pathlib import Path

# The cities the Explorer actually serves in its dropdown. Mirrors
# CUISINE_DATASET_IDS in frontend/src/explorer/explorer-app.jsx — the other
# prepared datasets (the older Philadelphia Yelp-POI set, the Toronto fixture)
# are not selectable in the UI, so their tiles are not downloaded.
SERVED_DATASETS = ("philadelphia-cuisine", "new-orleans")

# The offline pack only needs to reach the point-selection zoom; deeper levels
# are upsampled from these in the browser. Keep in sync with maxNativeZoom in
# frontend/src/utils/offline-tiles.js.
MIN_ZOOM = 10
MAX_ZOOM = 15

# Same mirror the app falls back to online — the .de domain is not DNS-blocked.
TILE_URL = "https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png"
SUBDOMAINS = "abc"
USER_AGENT = "SpatialWeb-Explorer/1.0 (academic demo; offline tile pack)"
# Polite pacing: a short delay between requests keeps the load low.
DELAY_S = 0.1

REPO_ROOT = Path(__file__).resolve().parents[2]
DATASETS_DIR = REPO_ROOT / "backend" / "runtime" / "datasets"
OUT_DIR = REPO_ROOT / "frontend" / "public" / "tiles"


def deg_to_tile(lat: float, lon: float, zoom: float) -> tuple[int, int]:
    """Web-mercator tile x/y for a lat/lon at a zoom level."""
    n = 2**zoom
    x = int((lon + 180.0) / 360.0 * n)
    rad = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(rad)) / math.pi) / 2.0 * n)
    return x, y


def dataset_bounds() -> list[tuple[float, float, float, float]]:
    """(min_lat, max_lat, min_lon, max_lon) for each served lat/lon dataset."""
    bounds = []
    for dataset_id in SERVED_DATASETS:
        meta = DATASETS_DIR / dataset_id / "instances.json"
        if not meta.is_file():
            print(f"  ! {dataset_id}: no instances.json (prepare it first) — skipped")
            continue
        data = json.loads(meta.read_text(encoding="utf-8"))
        lats = [i["lat"] for i in data if i.get("lat") is not None]
        lons = [i["lon"] for i in data if i.get("lon") is not None]
        if not lats:
            continue  # xy-only dataset (CRS.Simple) has no tiles
        bounds.append((min(lats), max(lats), min(lons), max(lons)))
        print(f"  {dataset_id}: {len(lats)} pts")
    return bounds


def wanted_tiles() -> set[tuple[int, int, int]]:
    """Union of (z, x, y) tiles covering every dataset bbox across the zoom range."""
    tiles: set[tuple[int, int, int]] = set()
    for min_lat, max_lat, min_lon, max_lon in dataset_bounds():
        for z in range(MIN_ZOOM, MAX_ZOOM + 1):
            x0, y0 = deg_to_tile(max_lat, min_lon, z)  # top-left
            x1, y1 = deg_to_tile(min_lat, max_lon, z)  # bottom-right
            for x in range(min(x0, x1), max(x0, x1) + 1):
                for y in range(min(y0, y1), max(y0, y1) + 1):
                    tiles.add((z, x, y))
    return tiles


def download(tile: tuple[int, int, int]) -> bool:
    z, x, y = tile
    sub = SUBDOMAINS[(x + y) % len(SUBDOMAINS)]
    url = TILE_URL.format(s=sub, z=z, x=x, y=y)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    dest = OUT_DIR / str(z) / str(x) / f"{y}.png"
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            dest.write_bytes(response.read())
        return True
    except (urllib.error.URLError, OSError) as exc:
        print(f"  ! {z}/{x}/{y} failed: {exc}")
        return False


def main() -> None:
    print(f"Datasets in {DATASETS_DIR}:")
    tiles = wanted_tiles()
    total = len(tiles)
    print(f"\n{total} tiles (z{MIN_ZOOM}-{MAX_ZOOM}) -> {OUT_DIR}")

    done = skipped = failed = 0
    for i, tile in enumerate(sorted(tiles), start=1):
        z, x, y = tile
        dest = OUT_DIR / str(z) / str(x) / f"{y}.png"
        if dest.exists() and dest.stat().st_size > 0:
            skipped += 1
            continue
        if download(tile):
            done += 1
        else:
            failed += 1
        time.sleep(DELAY_S)
        if i % 200 == 0 or i == total:
            print(f"  {i}/{total}  (new {done}, cached {skipped}, failed {failed})")

    print(f"\nDone. new={done} cached={skipped} failed={failed} total={total}")
    if failed:
        print("Re-run to retry failed tiles (existing ones are skipped).")


if __name__ == "__main__":
    main()
