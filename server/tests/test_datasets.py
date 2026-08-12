"""Dataset preparation: identity mapping survives the round trip to the miner."""

from __future__ import annotations

import csv

import pytest

from server.datasets import ColumnMap, DatasetInfo, prepare


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
    monkeypatch.setattr("server.datasets.PREPARED_DIR", tmp_path / "prepared")
    dataset = prepare(info)

    index = dataset.index()
    assert index[("Cafe", 1)]["id"] == "b-1"
    assert index[("Cafe", 2)]["id"] == "b-3"
    assert index[("Bar", 1)]["id"] == "b-2"
    assert dataset.feature_counts == {"Cafe": 2, "Bar": 1}


def test_miner_csv_has_the_shape_the_miner_expects(info, monkeypatch, tmp_path):
    monkeypatch.setattr("server.datasets.PREPARED_DIR", tmp_path / "prepared")
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
    monkeypatch.setattr("server.datasets.PREPARED_DIR", tmp_path / "prepared")
    coordinates_only = DatasetInfo(
        id="fixture-xy",
        label="Fixture XY",
        source=source_csv,
        columns=ColumnMap(feature="kind", x="east", y="north"),
    )
    dataset = prepare(coordinates_only)

    assert dataset.has_latlon is False
    assert dataset.instances[0]["id"] == "Cafe1"


def test_missing_column_is_reported_by_name(info, monkeypatch, tmp_path, source_csv):
    monkeypatch.setattr("server.datasets.PREPARED_DIR", tmp_path / "prepared")
    broken = DatasetInfo(
        id="broken",
        label="Broken",
        source=source_csv,
        columns=ColumnMap(feature="kind", x="missing_x", y="north"),
    )
    with pytest.raises(ValueError, match="missing_x"):
        prepare(broken)


def test_preparation_is_reused_until_the_source_changes(info, monkeypatch, tmp_path):
    monkeypatch.setattr("server.datasets.PREPARED_DIR", tmp_path / "prepared")
    first = prepare(info)
    stamp = first.miner_csv.stat().st_mtime_ns

    prepare(info)
    assert first.miner_csv.stat().st_mtime_ns == stamp, "unchanged source re-converted"

    with info.source.open("a", encoding="utf-8", newline="") as handle:
        csv.writer(handle).writerow(["b-4", "Bar", "39.98", "-75.19", "70.0", "80.0"])

    rebuilt = prepare(info)
    assert rebuilt.feature_counts == {"Cafe": 2, "Bar": 2}
