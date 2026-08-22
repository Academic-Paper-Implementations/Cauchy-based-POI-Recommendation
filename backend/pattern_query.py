"""Answer "what does this point take part in?" for a mined result.

Clicking an instance on the map has to produce two things: the patterns that
instance participates in, and — for a chosen pattern — the nearby instances that
participate in the same pattern, so the map can show the co-location rather than
just assert it.

Neighbours are found here rather than exported by the miner. The miner would
have to emit its neighbour graph, which is far larger than the result itself,
while the server already holds every coordinate and can answer one click by
scanning a handful of grid cells.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .datasets import PreparedDataset


class SpatialGrid:
    """Uniform grid over the dataset, one cell per epsilon, for radius queries."""

    def __init__(self, instances: list[dict], cell_size: float) -> None:
        self.cell_size = max(float(cell_size), 1e-9)
        self.cells: dict[tuple[int, int], list[dict]] = {}
        for inst in instances:
            self.cells.setdefault(self._cell(inst["x"], inst["y"]), []).append(inst)

    def _cell(self, x: float, y: float) -> tuple[int, int]:
        return (int(math.floor(x / self.cell_size)), int(math.floor(y / self.cell_size)))

    def within(
        self, x: float, y: float, radius: float, exclude: dict | None = None
    ) -> list[tuple[dict, float]]:
        """Instances within `radius`, each with its distance.

        `exclude` is skipped by object identity — the query point itself. A plain
        distance == 0 test would also drop *other* instances that happen to share
        the exact coordinates, silently losing co-locations, so identity is used.
        """
        cx, cy = self._cell(x, y)
        span = int(math.ceil(radius / self.cell_size))
        found: list[tuple[dict, float]] = []
        for gx in range(cx - span, cx + span + 1):
            for gy in range(cy - span, cy + span + 1):
                for inst in self.cells.get((gx, gy), ()):
                    if inst is exclude:
                        continue
                    distance = math.hypot(inst["x"] - x, inst["y"] - y)
                    if distance <= radius:
                        found.append((inst, distance))
        return found


@dataclass
class PatternIndex:
    """A mined result with participation turned into sets for membership tests."""

    patterns: list[dict]
    participation: list[dict[str, set[int]]]

    @classmethod
    def build(cls, result: dict) -> "PatternIndex":
        patterns = result.get("patterns", [])
        participation = [
            {
                feature: set(numbers)
                for feature, numbers in pattern.get("participating", {}).items()
            }
            for pattern in patterns
        ]
        return cls(patterns=patterns, participation=participation)

    def patterns_of(self, feature: str, number: int) -> list[int]:
        """Indices of the patterns this instance participates in."""
        return [
            i
            for i, sets in enumerate(self.participation)
            if number in sets.get(feature, ())
        ]


def describe_pattern(pattern: dict, rare: set[str], participation_counts: dict[str, int]) -> dict:
    """Shape one pattern for the API, carrying per-feature instance counts."""
    return {
        "features": pattern["features"],
        "size": pattern["size"],
        "wpi": pattern["wpi"],
        "deduced": pattern["deduced"],
        "rare_features": [f for f in pattern["features"] if f in rare],
        "participation_counts": participation_counts,
    }


def participation_counts(pattern: dict) -> dict[str, int]:
    return {
        feature: len(numbers)
        for feature, numbers in pattern.get("participating", {}).items()
    }


def query_instance(
    dataset: PreparedDataset,
    index: PatternIndex,
    grid: SpatialGrid,
    feature: str,
    number: int,
    eps_m: float,
    rare: set[str],
) -> dict:
    """Patterns the instance takes part in, each with its co-participating neighbours."""
    lookup = dataset.index()
    origin = lookup.get((feature, number))
    if origin is None:
        raise KeyError(f"{feature}{number}")

    nearby = grid.within(origin["x"], origin["y"], eps_m, exclude=origin)

    results = []
    for i in index.patterns_of(feature, number):
        pattern = index.patterns[i]
        sets = index.participation[i]
        members = set(pattern["features"])

        neighbours = [
            {
                **_point(inst),
                "distance_m": round(distance, 2),
            }
            for inst, distance in nearby
            if inst["feature"] in members
            and inst["number"] in sets.get(inst["feature"], ())
        ]
        neighbours.sort(key=lambda item: item["distance_m"])

        described = describe_pattern(pattern, rare, participation_counts(pattern))
        described["pattern_index"] = i
        described["neighbors"] = neighbours
        results.append(described)

    results.sort(key=lambda item: (-item["size"], item["features"]))
    return {
        "instance": _point(origin),
        "eps_m": eps_m,
        "pattern_count": len(results),
        "patterns": results,
    }


def _point(inst: dict) -> dict:
    point = {
        "feature": inst["feature"],
        "number": inst["number"],
        "id": inst["id"],
        "lat": inst["lat"],
        "lon": inst["lon"],
        "x": inst["x"],
        "y": inst["y"],
    }
    # Display fields for the explorer popup, present only on datasets that carry
    # them (cuisine datasets); absent keys keep existing datasets' shape intact.
    for key in ("name", "stars", "review_count", "attributes"):
        if key in inst:
            point[key] = inst[key]
    return point
