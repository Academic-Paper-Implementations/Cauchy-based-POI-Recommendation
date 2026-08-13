"""Turn a mined result into investment recommendations.

Both recommendations rest on one idea:

    a location is attractive for feature ``B`` when the other members of a
    prevalent pattern containing ``B`` are already present nearby, and ``B``
    itself is not.

Nothing here re-runs the miner. Everything is derived from a finished result
plus the dataset's coordinates, the same way the rare-threshold slider already
relabels a result at read time.

Two things make it cheap enough to answer per click:

* **Features as bits.** With at most 64 distinct features, "which features are
  present here" is one integer and "is pattern P supported here" is one ``AND``
  plus a compare, instead of a set intersection.
* **Only occupied cells are scored.** On Philadelphia at eps = 80 m the bounding
  box holds 428,359 cells but only 4,695 contain an instance. An empty cell
  scores zero by construction, so skipping it loses nothing and saves ~99% of
  the work.

Patterns accepted by Lemma 2 carry ``wpi: null`` — the miner never computed one
for them. They are prevalent, so their true WPI is at least ``min_prev``; that
lower bound is substituted rather than dropping them, which would silently throw
away large deduced patterns.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass

from .datasets import PreparedDataset
from .pattern_query import SpatialGrid, participation_counts
# The inverse of the projection uploads are put through, so it has to use the
# same earth radius the forward direction used.
from .upload import EARTH_RADIUS_M

# A pattern is a set of features, and enumerating cliques over the feature set is
# what actually limits this app; the bitmask below just inherits the same ceiling.
MAX_FEATURES = 64

# Cells above this percentile of the positive scores are the ones clustered into
# regions. Lower and every faint cell joins a region; higher and sharp single
# cells are all that survive.
REGION_PERCENTILE = 90.0

# How many supporting patterns to explain a region with. The full list can run to
# hundreds and the point is to make the score checkable, not to re-list the result.
MAX_REGION_PATTERNS = 5


class TooManyFeatures(ValueError):
    """More distinct features than the bitmask index can represent."""


class FeatureBits:
    """Features as bit positions, assigned in sorted order so they are stable."""

    def __init__(self, features) -> None:
        names = sorted(set(features))
        if len(names) > MAX_FEATURES:
            raise TooManyFeatures(
                f"{len(names)} distinct features; at most {MAX_FEATURES} are supported"
            )
        self.bits: dict[str, int] = {name: 1 << i for i, name in enumerate(names)}

    def bit(self, feature: str) -> int:
        return self.bits.get(feature, 0)

    def mask(self, features) -> int:
        mask = 0
        for feature in features:
            mask |= self.bits.get(feature, 0)
        return mask


@dataclass
class CellPresence:
    """Which features occur in each occupied epsilon-cell, and how many of each.

    ``masks`` is *dilated*: a cell's mask is the OR of its own and its eight
    neighbours, which approximates "present within epsilon of this cell" with one
    pass instead of a radius query per cell. It is deliberately an approximation
    — the true epsilon neighbourhood is a circle, this is a 3x3 block of cells —
    and it is generous rather than strict, so a cell is never wrongly discarded.
    """

    cell_size: float
    masks: dict[tuple[int, int], int]
    counts: dict[tuple[int, int], dict[str, int]]

    @classmethod
    def build(cls, instances: list[dict], cell_size: float, bits: FeatureBits) -> "CellPresence":
        size = max(float(cell_size), 1e-9)
        own: dict[tuple[int, int], int] = {}
        counts: dict[tuple[int, int], dict[str, int]] = defaultdict(lambda: defaultdict(int))

        for inst in instances:
            cell = (int(math.floor(inst["x"] / size)), int(math.floor(inst["y"] / size)))
            own[cell] = own.get(cell, 0) | bits.bit(inst["feature"])
            counts[cell][inst["feature"]] += 1

        masks = {}
        for cx, cy in own:
            mask = 0
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    mask |= own.get((cx + dx, cy + dy), 0)
            masks[(cx, cy)] = mask

        return cls(cell_size=size, masks=masks, counts={c: dict(v) for c, v in counts.items()})

    def count(self, cell: tuple[int, int], feature: str) -> int:
        return self.counts.get(cell, {}).get(feature, 0)


@dataclass(frozen=True)
class LatLonFrame:
    """Inverse of the app's locally-flat projection, anchored on a real instance.

    The forward direction (``upload.project_local``) is
    ``x = R * radians(lon - lon0) * cos(lat0)``, ``y = R * radians(lat - lat0)``,
    so the inverse is linear around any point whose metres *and* degrees are both
    known. Used to give a region's bounding box in degrees, which the map needs
    to draw it, without the frontend having to know the projection.
    """

    lat0: float
    lon0: float
    x0: float
    y0: float

    @classmethod
    def of(cls, dataset: PreparedDataset) -> "LatLonFrame | None":
        for inst in dataset.instances:
            if inst.get("lat") is not None and inst.get("lon") is not None:
                return cls(lat0=inst["lat"], lon0=inst["lon"], x0=inst["x"], y0=inst["y"])
        return None

    def to_latlon(self, x: float, y: float) -> tuple[float, float]:
        lat = self.lat0 + math.degrees((y - self.y0) / EARTH_RADIUS_M)
        east = EARTH_RADIUS_M * math.cos(math.radians(self.lat0))
        lon = self.lon0 + math.degrees((x - self.x0) / east)
        return lat, lon


def pattern_weight(pattern: dict, min_prev: float) -> float:
    """The WPI to score with, substituting the Lemma 2 lower bound when absent."""
    wpi = pattern.get("wpi")
    return float(min_prev) if wpi is None else float(wpi)


def _describe(pattern: dict, index: int, min_prev: float) -> dict:
    """One supporting pattern, shaped like the ones the pattern table already shows.

    ``pattern_index`` is the same index the result endpoint hands out, so a
    pattern quoted as evidence here can be found in the full table.
    """
    return {
        "pattern_index": index,
        "features": pattern["features"],
        "size": pattern["size"],
        "wpi": pattern["wpi"],
        "deduced": pattern["deduced"],
        "weight": pattern_weight(pattern, min_prev),
        "participation_counts": participation_counts(pattern),
    }


def recommend_for_point(
    *,
    dataset: PreparedDataset,
    patterns: list[dict],
    grid: SpatialGrid,
    bits: FeatureBits,
    feature: str,
    number: int,
    eps_m: float,
    min_prev: float,
    rare: set[str],
) -> dict:
    """Rank the features worth adding at one existing instance's location.

    A candidate pattern is *ready* when every one of its features except the
    candidate is already within epsilon of the point — the point's own feature
    included, which is why it is added to the presence mask by hand.
    """
    origin = dataset.index().get((feature, number))
    if origin is None:
        raise KeyError(f"{feature}{number}")

    nearby = grid.within(origin["x"], origin["y"], eps_m)
    present: dict[str, int] = defaultdict(int)
    present[feature] += 1  # the selected point itself; grid.within() excludes it
    for inst, _ in nearby:
        present[inst["feature"]] += 1
    present_mask = bits.mask(present)

    candidates: dict[str, dict] = {}
    for index, pattern in enumerate(patterns):
        members = pattern["features"]
        if feature not in members:
            continue
        pattern_mask = bits.mask(members)
        weight = pattern_weight(pattern, min_prev)

        for candidate in members:
            if candidate == feature:
                continue
            entry = candidates.setdefault(
                candidate,
                {
                    "feature": candidate,
                    "score": 0.0,
                    "ready_count": 0,
                    "total_count": 0,
                    "existing_nearby": present.get(candidate, 0),
                    "is_rare": candidate in rare,
                    "supporting_patterns": [],
                },
            )
            entry["total_count"] += 1
            # Everything the pattern asks for except the candidate itself.
            needed = pattern_mask & ~bits.bit(candidate)
            if needed & present_mask == needed:
                entry["ready_count"] += 1
                entry["score"] += weight
                entry["supporting_patterns"].append(_describe(pattern, index, min_prev))

    ranked = sorted(
        candidates.values(),
        key=lambda item: (-item["score"], -item["ready_count"], item["feature"]),
    )
    for entry in ranked:
        entry["score"] = round(entry["score"], 6)
        entry["supporting_patterns"].sort(key=lambda p: (-p["weight"], p["features"]))

    return {
        "instance": {
            "feature": origin["feature"],
            "number": origin["number"],
            "id": origin["id"],
            "lat": origin["lat"],
            "lon": origin["lon"],
            "x": origin["x"],
            "y": origin["y"],
        },
        "eps_m": eps_m,
        "nearby_features": dict(sorted(present.items())),
        "recommendations": ranked,
    }


def _score_cells(
    presence: CellPresence, needs: list[tuple[int, float]]
) -> dict[tuple[int, int], float]:
    """Score every occupied cell, memoised on the presence mask.

    Distinct masks are far fewer than cells (2,270 masks over 4,695 cells on
    Philadelphia at eps = 80 m), so roughly half the cells cost a dict lookup.
    """
    memo: dict[int, float] = {}
    scores: dict[tuple[int, int], float] = {}
    for cell, mask in presence.masks.items():
        score = memo.get(mask)
        if score is None:
            score = sum(weight for needed, weight in needs if needed & mask == needed)
            memo[mask] = score
        if score > 0:
            scores[cell] = score
    return scores


def _percentile(values: list[float], percentile: float) -> float:
    """Nearest-rank percentile. Small lists make interpolation pointless here."""
    if not values:
        return 0.0
    ordered = sorted(values)
    rank = max(0, min(len(ordered) - 1, int(math.ceil(percentile / 100.0 * len(ordered))) - 1))
    return ordered[rank]


def _regions_from(cells: set[tuple[int, int]]) -> list[list[tuple[int, int]]]:
    """Eight-way flood fill: contiguous high-scoring cells become one region."""
    remaining = set(cells)
    regions: list[list[tuple[int, int]]] = []
    while remaining:
        start = remaining.pop()
        group = [start]
        stack = [start]
        while stack:
            cx, cy = stack.pop()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    neighbour = (cx + dx, cy + dy)
                    if neighbour in remaining:
                        remaining.discard(neighbour)
                        group.append(neighbour)
                        stack.append(neighbour)
        regions.append(group)
    return regions


def recommend_areas(
    *,
    presence: CellPresence,
    patterns: list[dict],
    bits: FeatureBits,
    feature: str,
    min_prev: float,
    top: int = 10,
    frame: LatLonFrame | None = None,
    percentile: float = REGION_PERCENTILE,
) -> dict:
    """Rank contiguous regions where one feature has the most co-location support.

    Regions are ordered by their **peak** cell score, which favours a sharp
    opportunity over a large diffuse one; the total score and cell count come back
    alongside it so the caller can order the other way round instead.
    """
    supporting: list[tuple[int, float, int, dict]] = []
    for index, pattern in enumerate(patterns):
        if feature not in pattern["features"]:
            continue
        needed = bits.mask(pattern["features"]) & ~bits.bit(feature)
        supporting.append((needed, pattern_weight(pattern, min_prev), index, pattern))

    empty = {
        "feature": feature,
        "cell_size_m": presence.cell_size,
        "pattern_count": len(supporting),
        "scored_cell_count": 0,
        "score_threshold": 0.0,
        "regions": [],
    }
    if not supporting:
        return empty

    needs = [(needed, weight) for needed, weight, _, _ in supporting]
    scores = _score_cells(presence, needs)
    if not scores:
        return {**empty, "pattern_count": len(supporting)}

    threshold = _percentile(list(scores.values()), percentile)
    selected = {cell for cell, score in scores.items() if score >= threshold}

    size = presence.cell_size
    regions = []
    for group in _regions_from(selected):
        peak_cell = max(group, key=lambda cell: scores[cell])
        xs = [cell[0] for cell in group]
        ys = [cell[1] for cell in group]
        bbox = {
            "x_min": min(xs) * size,
            "y_min": min(ys) * size,
            "x_max": (max(xs) + 1) * size,
            "y_max": (max(ys) + 1) * size,
        }
        centroid = {
            "x": (sum(xs) / len(xs) + 0.5) * size,
            "y": (sum(ys) / len(ys) + 0.5) * size,
        }
        if frame:
            lat_min, lon_min = frame.to_latlon(bbox["x_min"], bbox["y_min"])
            lat_max, lon_max = frame.to_latlon(bbox["x_max"], bbox["y_max"])
            bbox |= {
                "lat_min": lat_min,
                "lon_min": lon_min,
                "lat_max": lat_max,
                "lon_max": lon_max,
            }
            centroid_lat, centroid_lon = frame.to_latlon(centroid["x"], centroid["y"])
            centroid |= {"lat": centroid_lat, "lon": centroid_lon}

        # Explain the region by the patterns its best cell actually satisfies.
        peak_mask = presence.masks[peak_cell]
        matched = [
            (weight, index, pattern)
            for needed, weight, index, pattern in supporting
            if needed & peak_mask == needed
        ]
        matched.sort(key=lambda item: (-item[0], item[2]["features"]))

        regions.append(
            {
                "peak_score": round(scores[peak_cell], 6),
                "total_score": round(sum(scores[cell] for cell in group), 6),
                "cell_count": len(group),
                "saturation": sum(presence.count(cell, feature) for cell in group),
                "centroid": centroid,
                "bbox": bbox,
                "supporting_pattern_count": len(matched),
                "supporting_patterns": [
                    _describe(pattern, index, min_prev)
                    for _, index, pattern in matched[:MAX_REGION_PATTERNS]
                ],
            }
        )

    regions.sort(key=lambda region: (-region["peak_score"], -region["total_score"]))
    for rank, region in enumerate(regions[:top], start=1):
        region["rank"] = rank

    return {
        "feature": feature,
        "cell_size_m": size,
        "pattern_count": len(supporting),
        "scored_cell_count": len(scores),
        "score_threshold": round(threshold, 6),
        "region_count": len(regions),
        "regions": regions[:top],
    }
