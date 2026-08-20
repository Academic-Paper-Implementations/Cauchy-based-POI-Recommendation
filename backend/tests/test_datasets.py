"""Dataset preparation: identity mapping survives the round trip to the miner."""

from __future__ import annotations

import csv

import pytest

from backend.datasets import ColumnMap, DatasetInfo, prepare


@pytest.fixture
def source_csv(tmp_path):
    path = tmp_path / "source.csv"
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["biz", "kind", "lat", "lon", "east", "north"])
        writer.writerow(["b-1", "Cafe", "39.95", "-75.16", "10.0", "20.0"])
        writer.writerow(["b-2", "Bar", "39.96", "-75.17", "30.0", "40.0"])
        writer.writerow(["b-3", "Cafe", "39.97", "-75.18", "50.0", "60.0"])
    return path


@pytest.fixture
def info(source_csv):
    return DatasetInfo(
        id="fixture",
        label="Fixture",
        source=source_csv,
        columns=ColumnMap(
            feature="kind",
            x="east",
            y="north",
            latitude="lat",
            longitude="lon",
            identifier="biz",
        ),
    )


def test_numbering_restarts_per_feature_and_maps_back(info, monkeypatch, tmp_path):
    monkeypatch.setattr("backend.datasets.PREPARED_DIR", tmp_path / "prepared")
    dataset = prepare(info)

    index = dataset.index()
    assert index[("Cafe", 1)]["id"] == "b-1"
    assert index[("Cafe", 2)]["id"] == "b-3"
    assert index[("Bar", 1)]["id"] == "b-2"
    assert dataset.feature_counts == {"Cafe": 2, "Bar": 1}


def test_miner_csv_has_the_shape_the_miner_expects(info, monkeypatch, tmp_path):
    monkeypatch.setattr("backend.datasets.PREPARED_DIR", tmp_path / "prepared")
    dataset = prepare(info)

    raw = dataset.miner_csv.read_bytes()
    assert not raw.startswith(b"\xef\xbb\xbf"), "miner CSV must not carry a BOM"

    rows = list(csv.reader(dataset.miner_csv.read_text(encoding="utf-8").splitlines()))
    assert rows[0] == ["Feature", "Instance", "LocX", "LocY"]
    assert rows[1:] == [
        ["Cafe", "1", "10.0", "20.0"],
        ["Bar", "1", "30.0", "40.0"],
        ["Cafe", "2", "50.0", "60.0"],
    ]


def test_latlon_is_optional(info, monkeypatch, tmp_path, source_csv):
    monkeypatch.setattr("backend.datasets.PREPARED_DIR", tmp_path / "prepared")
    coordinates_only = DatasetInfo(
        id="fixture-xy",
        label="Fixture XY",
        source=source_csv,
        columns=ColumnMap(feature="kind", x="east", y="north"),
    )
    dataset = prepare(coordinates_only)

    assert dataset.has_latlon is False
    assert dataset.instances[0]["id"] == "Cafe1"


def test_display_fields_are_absent_unless_mapped(info, monkeypatch, tmp_path):
    """A dataset that maps no display columns keeps its exact record shape."""
    monkeypatch.setattr("backend.datasets.PREPARED_DIR", tmp_path / "prepared")
    record = prepare(info).instances[0]
    assert set(record) == {"feature", "number", "x", "y", "lat", "lon", "id"}


def test_display_fields_are_carried_and_typed_when_mapped(monkeypatch, tmp_path):
    """name/stars/review_count are typed; the attributes bag keeps raw strings;
    a missing display cell becomes None, never a fabricated value."""
    source = tmp_path / "attr.csv"
    with source.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["biz", "name", "kind", "east", "north",
                         "stars", "review_count", "price", "takeout"])
        writer.writerow(["b-1", "Cafe One", "Cafe", "10.0", "20.0",
                         "4.0", "80", "2", "true"])
        writer.writerow(["b-2", "Bar Two", "Bar", "30.0", "40.0", "4.5", "", "", ""])
    monkeypatch.setattr("backend.datasets.PREPARED_DIR", tmp_path / "prepared")
    dataset = prepare(DatasetInfo(
        id="attr", label="Attr", source=source,
        columns=ColumnMap(
            feature="kind", x="east", y="north", identifier="biz", name="name",
            stars="stars", review_count="review_count", attributes=("price", "takeout"),
        ),
    ))
    first, second = dataset.instances
    assert first["name"] == "Cafe One"
    assert first["stars"] == 4.0 and isinstance(first["stars"], float)
    assert first["review_count"] == 80 and isinstance(first["review_count"], int)
    assert first["attributes"] == {"price": "2", "takeout": "true"}
    # empty cells -> None, never "" or a fabricated "No"/"false"
    assert second["review_count"] is None
    assert second["attributes"] == {"price": None, "takeout": None}


def test_missing_column_is_reported_by_name(info, monkeypatch, tmp_path, source_csv):
    monkeypatch.setattr("backend.datasets.PREPARED_DIR", tmp_path / "prepared")
    broken = DatasetInfo(
        id="broken",
        label="Broken",
        source=source_csv,
        columns=ColumnMap(feature="kind", x="missing_x", y="north"),
    )
    with pytest.raises(ValueError, match="missing_x"):
        prepare(broken)


def test_preparation_is_reused_until_the_source_changes(info, monkeypatch, tmp_path):
    monkeypatch.setattr("backend.datasets.PREPARED_DIR", tmp_path / "prepared")
    first = prepare(info)
    stamp = first.miner_csv.stat().st_mtime_ns

    prepare(info)
    assert first.miner_csv.stat().st_mtime_ns == stamp, "unchanged source re-converted"

    with info.source.open("a", encoding="utf-8", newline="") as handle:
        csv.writer(handle).writerow(["b-4", "Bar", "39.98", "-75.19", "70.0", "80.0"])

    rebuilt = prepare(info)
    assert rebuilt.feature_counts == {"Cafe": 2, "Bar": 2}
