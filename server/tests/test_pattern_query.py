"""Instance queries: which patterns a point is in, and who it sits next to."""

from __future__ import annotations

import csv

import pytest

from server.datasets import ColumnMap, DatasetInfo, prepare
from server.pattern_query import PatternIndex, SpatialGrid, query_instance

RESULT = {
    "feature_counts": {"Cafe": 2, "Bar": 1},
    "patterns": [
        {
            "features": ["Bar", "Cafe"],
            "size": 2,
            "wpi": 0.5,
            "deduced": False,
            "participating": {"Bar": [1], "Cafe": [1, 2]},
        },
        {
            "features": ["Cafe", "Deli"],
            "size": 2,
            "wpi": None,
            "deduced": True,
            "participating": {"Cafe": [2], "Deli": [1]},
        },
    ],
}


@pytest.fixture
def index():
    return PatternIndex.build(RESULT)


def test_only_patterns_containing_the_instance_are_returned(tiny_dataset, index):
    answer = query_instance(
        dataset=tiny_dataset,
        index=index,
        grid=SpatialGrid(tiny_dataset.instances, 120.0),
        feature="Cafe",
        number=1,
        eps_m=120.0,
        rare={"Bar"},
    )
    assert answer["pattern_count"] == 1
    assert answer["patterns"][0]["features"] == ["Bar", "Cafe"]
    assert answer["instance"]["id"] == "b-1"


def test_neighbours_are_co_participants_inside_epsilon(tiny_dataset, index):
    answer = query_instance(
        dataset=tiny_dataset,
        index=index,
        grid=SpatialGrid(tiny_dataset.instances, 120.0),
        feature="Cafe",
        number=1,
        eps_m=120.0,
        rare=set(),
    )
    neighbours = answer["patterns"][0]["neighbors"]
    assert [(n["feature"], n["number"]) for n in neighbours] == [("Bar", 1)]
    assert neighbours[0]["distance_m"] == 50.0


def test_a_co_participant_beyond_epsilon_is_not_a_neighbour(tiny_dataset, index):
    # Cafe2 participates in the same pattern but sits ~7 km away.
    answer = query_instance(
        dataset=tiny_dataset,
        index=index,
        grid=SpatialGrid(tiny_dataset.instances, 120.0),
        feature="Cafe",
        number=2,
        eps_m=120.0,
        rare=set(),
    )
    assert answer["patterns"][0]["neighbors"] == []


def test_rare_features_are_reported_per_pattern(tiny_dataset, index):
    answer = query_instance(
        dataset=tiny_dataset,
        index=index,
        grid=SpatialGrid(tiny_dataset.instances, 120.0),
        feature="Cafe",
        number=1,
        eps_m=120.0,
        rare={"Bar"},
    )
    pattern = answer["patterns"][0]
    assert pattern["rare_features"] == ["Bar"]
    assert pattern["participation_counts"] == {"Bar": 1, "Cafe": 2}


def test_unknown_instance_is_rejected(tiny_dataset, index):
    with pytest.raises(KeyError):
        query_instance(
            dataset=tiny_dataset,
            index=index,
            grid=SpatialGrid(tiny_dataset.instances, 120.0),
            feature="Cafe",
            number=99,
            eps_m=120.0,
            rare=set(),
        )


def test_deduced_pattern_keeps_a_null_wpi(index):
    assert index.patterns[1]["wpi"] is None
    assert index.patterns[1]["deduced"] is True


def test_neighbours_and_origin_carry_display_fields_when_mapped(tmp_path, monkeypatch, index):
    """A dataset that maps name/stars/attributes surfaces them on origin + neighbours;
    a missing attribute becomes None (never a fabricated value)."""
    source = tmp_path / "attr.csv"
    with source.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["biz", "name", "kind", "lat", "lon", "east", "north",
                         "stars", "review_count", "price", "takeout"])
        writer.writerow(["b-1", "Cafe One", "Cafe", "39.95", "-75.16", "0.0", "0.0",
                         "4.0", "80", "2", "true"])
        writer.writerow(["b-2", "Bar Two", "Bar", "39.96", "-75.17", "50.0", "0.0",
                         "4.5", "", "", ""])
    monkeypatch.setattr("server.datasets.PREPARED_DIR", tmp_path / "prepared")
    dataset = prepare(DatasetInfo(
        id="attr", label="Attr", source=source,
        columns=ColumnMap(
            feature="kind", x="east", y="north", latitude="lat", longitude="lon",
            identifier="biz", name="name", stars="stars", review_count="review_count",
            attributes=("price", "takeout"),
        ),
    ))
    answer = query_instance(
        dataset=dataset, index=index, grid=SpatialGrid(dataset.instances, 120.0),
        feature="Cafe", number=1, eps_m=120.0, rare=set(),
    )
    origin = answer["instance"]
    assert origin["name"] == "Cafe One"
    assert origin["stars"] == 4.0
    assert origin["attributes"] == {"price": "2", "takeout": "true"}

    neighbour = answer["patterns"][0]["neighbors"][0]
    assert neighbour["feature"] == "Bar"
    assert neighbour["name"] == "Bar Two"
    assert neighbour["stars"] == 4.5
    assert neighbour["review_count"] is None          # empty cell -> None
    assert neighbour["attributes"] == {"price": None, "takeout": None}  # never "No"


def test_grid_finds_the_same_points_as_a_brute_force_scan(tiny_dataset):
    grid = SpatialGrid(tiny_dataset.instances, 60.0)
    origin = tiny_dataset.instances[0]
    found = {
        (inst["feature"], inst["number"]) for inst, _ in grid.within(origin["x"], origin["y"], 60.0)
    }
    expected = {
        (inst["feature"], inst["number"])
        for inst in tiny_dataset.instances
        if 0.0 < ((inst["x"] - origin["x"]) ** 2 + (inst["y"] - origin["y"]) ** 2) ** 0.5 <= 60.0
    }
    assert found == expected
