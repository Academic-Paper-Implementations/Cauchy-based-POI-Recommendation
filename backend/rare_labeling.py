"""Rare-feature labelling.

Rarity is a display decision, not a mining parameter: it is derived from the
feature counts the miner already reported, so moving the threshold relabels the
same result instead of re-running a job that can take tens of minutes.

A feature is rare when its instance count falls at or below the threshold, which
is the chosen percentile of the counts, floored so that a very small feature is
never called common just because the percentile landed below it.
"""

from __future__ import annotations

DEFAULT_PERCENTILE = 25.0
DEFAULT_MIN_COUNT = 30


def percentile(values: list[float], percent: float) -> float:
    """Linear-interpolation percentile, matching numpy's default method."""
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])

    percent = max(0.0, min(100.0, percent))
    position = (percent / 100.0) * (len(ordered) - 1)
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return float(ordered[lower] + (ordered[upper] - ordered[lower]) * weight)


def rare_threshold(
    feature_counts: dict[str, int],
    rare_percentile: float = DEFAULT_PERCENTILE,
    rare_min_count: int = DEFAULT_MIN_COUNT,
) -> float:
    """The count at or below which a feature counts as rare."""
    if not feature_counts:
        return 0.0
    return max(
        percentile([float(count) for count in feature_counts.values()], rare_percentile),
        float(rare_min_count),
    )


def label_rare(
    feature_counts: dict[str, int],
    rare_percentile: float = DEFAULT_PERCENTILE,
    rare_min_count: int = DEFAULT_MIN_COUNT,
) -> tuple[set[str], float]:
    """Return the rare features and the threshold that produced them."""
    threshold = rare_threshold(feature_counts, rare_percentile, rare_min_count)
    rare = {
        feature for feature, count in feature_counts.items() if float(count) <= threshold
    }
    return rare, threshold
