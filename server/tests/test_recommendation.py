"""Recommendations: what to build at a point, and where to build one feature.

The fixtures here are laid out by hand on a 100 m grid so every expected number
can be checked by reading the coordinates, not by re-running the algorithm.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from server.datasets import ColumnMap, DatasetInfo, PreparedDataset
from server.pattern_query import SpatialGrid
from server.recommendation import (
    MAX_FEATURES,
    CellPresence,
    FeatureBits,
    LatLonFrame,
    TooManyFeatures,
    recommend_areas,
    recommend_for_point,
)

EPS = 100.0
MIN_PREV = 0.2

PATTERNS = [
    {"features": ["Bar", "Cafe"], "size": 2, "wpi": 0.5, "deduced": False},
    # No WPI: accepted by Lemma 2, so min_prev stands in as its lower bound.
    {"features": ["Bar", "Cafe", "Deli"], "size": 3, "wpi": None, "deduced": True},
    {"features": ["Cafe", "Pharmacy"], "size": 2, "wpi": 0.9, "deduced": False},
    {"features": ["Bar", "Pharmacy"], "size": 2, "wpi": 0.4, "deduced": False},
]


def dataset(points: list[tuple[str, float, float]], *, latlon: bool = True) -> PreparedDataset:
    """A prepared dataset built in memory: only instances and counts are read."""
    per_feature: dict[str, int] = {}
    instances = []
    for feature, x, y in points:
        number = per_feature.get(feature, 0) + 1
        per_feature[feature] = number
        instances.append(
            {
                "feature": feature,
                "number": number,
                "id": f"{feature}{number}",
                "x": x,
                "y": y,
                # A metre of northing is a metre wherever it sits, so anchoring the
                # frame at (0, 0) keeps the degrees easy to reason about.
                "lat": 39.95 + y / 111_320.0 if latlon else None,
                "lon": -75.16 + x / 85_400.0 if latlon else None,
            }
        )
    return PreparedDataset(
        info=DatasetInfo(
            id="fixture",
            label="Fixture",
            source=Path("unused.csv"),
            columns=ColumnMap(feature="Feature", x="X", y="Y"),
        ),
        miner_csv=Path("unused.csv"),
        instances=instances,
        feature_counts=per_feature,
    )


@pytest.fixture
def bits() -> FeatureBits:
    return FeatureBits({"Bar", "Cafe", "Deli", "Pharmacy"})


@pytest.fixture
def point_dataset() -> PreparedDataset:
    # Cafe1 and Bar1 are 50 m apart; Deli1 is 150 m away, outside epsilon.
    return dataset([("Cafe", 0.0, 0.0), ("Bar", 50.0, 0.0), ("Deli", 150.0, 0.0)])


def at_cafe1(point_dataset, bits) -> dict:
    return recommend_for_point(
        dataset=point_dataset,
        patterns=PATTERNS,
        grid=SpatialGrid(point_dataset.instances, EPS),
        bits=bits,
        feature="Cafe",
        number=1,
        eps_m=EPS,
        min_prev=MIN_PREV,
        rare={"Deli"},
    )


def test_candidates_are_ranked_by_summed_wpi(point_dataset, bits):
    answer = at_cafe1(point_dataset, bits)

    # Pharmacy 0.9 (Cafe present) > Bar 0.5 > Deli 0.2 (the deduced lower bound).
    assert [r["feature"] for r in answer["recommendations"]] == ["Pharmacy", "Bar", "Deli"]
    assert [r["score"] for r in answer["recommendations"]] == [0.9, 0.5, 0.2]


def test_a_pattern_missing_a_member_nearby_is_not_ready(point_dataset, bits):
    bar = next(r for r in at_cafe1(point_dataset, bits)["recommendations"] if r["feature"] == "Bar")

    # Bar appears in two patterns, but {Bar, Cafe, Deli} needs a Deli within
    # epsilon and the only one sits 150 m away.
    assert (bar["ready_count"], bar["total_count"]) == (1, 2)
    assert [p["features"] for p in bar["supporting_patterns"]] == [["Bar", "Cafe"]]


def test_a_null_wpi_scores_as_the_min_prevalence_lower_bound(point_dataset, bits):
    deli = next(r for r in at_cafe1(point_dataset, bits)["recommendations"] if r["feature"] == "Deli")

    assert deli["score"] == MIN_PREV
    assert deli["supporting_patterns"][0]["wpi"] is None
    assert deli["supporting_patterns"][0]["deduced"] is True
    assert deli["supporting_patterns"][0]["weight"] == MIN_PREV


def test_existing_neighbours_and_rarity_are_reported(point_dataset, bits):
    ranked = {r["feature"]: r for r in at_cafe1(point_dataset, bits)["recommendations"]}

    assert ranked["Bar"]["existing_nearby"] == 1  # already one Bar within epsilon
    assert ranked["Pharmacy"]["existing_nearby"] == 0
    assert ranked["Deli"]["is_rare"] is True
    assert ranked["Bar"]["is_rare"] is False


def test_the_selected_point_counts_as_present(point_dataset, bits):
    """{Cafe, Pharmacy} is only ready because the clicked Cafe is itself a Cafe."""
    pharmacy = next(
        r for r in at_cafe1(point_dataset, bits)["recommendations"] if r["feature"] == "Pharmacy"
    )
    assert pharmacy["ready_count"] == 1


def test_an_unknown_instance_is_rejected(point_dataset, bits):
    with pytest.raises(KeyError):
        recommend_for_point(
            dataset=point_dataset,
            patterns=PATTERNS,
            grid=SpatialGrid(point_dataset.instances, EPS),
            bits=bits,
            feature="Cafe",
            number=99,
            eps_m=EPS,
            min_prev=MIN_PREV,
            rare=set(),
        )


# --- areas -----------------------------------------------------------------
#
# Cells are 100 m. Cell (0,0) holds a Cafe and a Bar, so it satisfies both
# Pharmacy patterns: 0.9 + 0.4 = 1.3. Cells (10,0), (11,0) and (12,0) hold a Cafe
# each and are contiguous, so each scores 0.9 and the three merge into one region
# worth 2.7. Ten empty cells separate the two groups, which is more than the
# one-cell dilation can bridge.

AREA_POINTS = [
    ("Cafe", 50.0, 50.0),
    ("Bar", 60.0, 60.0),
    ("Cafe", 1050.0, 50.0),
    ("Cafe", 1150.0, 50.0),
    ("Cafe", 1250.0, 50.0),
    ("Pharmacy", 1160.0, 60.0),
]


@pytest.fixture
def areas(bits) -> dict:
    data = dataset(AREA_POINTS)
    return recommend_areas(
        presence=CellPresence.build(data.instances, EPS, bits),
        patterns=PATTERNS,
        bits=bits,
        feature="Pharmacy",
        min_prev=MIN_PREV,
        top=10,
        frame=LatLonFrame.of(data),
        # Keep every scoring cell: the default 90th percentile would leave only
        # the single best one and there would be no regions left to compare.
        percentile=0.0,
    )


def test_contiguous_cells_merge_and_separated_cells_do_not(areas):
    assert [r["cell_count"] for r in areas["regions"]] == [1, 3]


def test_regions_rank_by_peak_not_by_total(areas):
    first, second = areas["regions"]

    # The single cell wins on peak (1.3 > 0.9) while losing on total (1.3 < 2.7),
    # which is exactly why both columns are reported.
    assert (first["peak_score"], first["total_score"]) == (1.3, 1.3)
    assert (second["peak_score"], second["total_score"]) == (0.9, 2.7)
    assert [r["rank"] for r in areas["regions"]] == [1, 2]


def test_saturation_counts_the_feature_already_there(areas):
    single, triple = areas["regions"]

    assert single["saturation"] == 0
    assert triple["saturation"] == 1  # the Pharmacy at (1160, 60)


def test_bbox_covers_the_cells_of_the_region(areas):
    triple = areas["regions"][1]

    assert triple["bbox"]["x_min"] == 1000.0
    assert triple["bbox"]["x_max"] == 1300.0
    assert triple["bbox"]["y_min"] == 0.0
    assert triple["bbox"]["y_max"] == 100.0
    assert triple["bbox"]["lat_min"] < triple["bbox"]["lat_max"]
    assert triple["bbox"]["lon_min"] < triple["bbox"]["lon_max"]


def test_the_peak_cell_explains_itself_with_the_patterns_it_satisfies(areas):
    single = areas["regions"][0]

    assert [p["features"] for p in single["supporting_patterns"]] == [
        ["Cafe", "Pharmacy"],
        ["Bar", "Pharmacy"],
    ]
    assert single["supporting_pattern_count"] == 2


def test_a_dataset_without_degrees_reports_metres_only(bits):
    data = dataset(AREA_POINTS, latlon=False)
    answer = recommend_areas(
        presence=CellPresence.build(data.instances, EPS, bits),
        patterns=PATTERNS,
        bits=bits,
        feature="Pharmacy",
        min_prev=MIN_PREV,
        frame=LatLonFrame.of(data),
        percentile=0.0,
    )
    assert LatLonFrame.of(data) is None
    assert "lat_min" not in answer["regions"][0]["bbox"]


def test_a_feature_in_no_pattern_has_no_regions(bits):
    data = dataset(AREA_POINTS)
    answer = recommend_areas(
        presence=CellPresence.build(data.instances, EPS, bits),
        patterns=PATTERNS,
        bits=bits,
        feature="Deli",
        min_prev=MIN_PREV,
        percentile=0.0,
    )
    # Deli appears only in {Bar, Cafe, Deli}, so it does have support; a feature
    # in no pattern at all is the empty case.
    assert answer["pattern_count"] == 1

    none = recommend_areas(
        presence=CellPresence.build(data.instances, EPS, bits),
        patterns=PATTERNS,
        bits=bits,
        feature="Laundry",
        min_prev=MIN_PREV,
        percentile=0.0,
    )
    assert none["regions"] == []


def test_dilation_lets_a_neighbouring_cell_supply_a_feature(bits):
    """Two points 20 m apart across a cell boundary still count as co-located."""
    data = dataset([("Cafe", 95.0, 50.0), ("Bar", 115.0, 50.0)])
    presence = CellPresence.build(data.instances, EPS, bits)

    assert presence.masks[(0, 0)] == bits.mask({"Cafe", "Bar"})
    assert presence.masks[(1, 0)] == bits.mask({"Cafe", "Bar"})


def test_more_features_than_the_index_holds_is_refused():
    with pytest.raises(TooManyFeatures, match=str(MAX_FEATURES)):
        FeatureBits(f"feature-{i}" for i in range(MAX_FEATURES + 1))

    assert len(FeatureBits(f"feature-{i}" for i in range(MAX_FEATURES)).bits) == MAX_FEATURES
