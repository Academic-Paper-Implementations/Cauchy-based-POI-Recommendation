"""Uploads: column mapping, projection, and the limits that protect the server."""

from __future__ import annotations

import math

import pytest

from server.upload import (
    MAX_FEATURES,
    MAX_INSTANCES,
    UploadError,
    parse_upload,
    project_local,
)

HEADER = "biz,kind,lat,lon\n"
ROWS = "b-1,Cafe,39.9500,-75.1600\nb-2,Bar,39.9550,-75.1650\n"

LATLON_MAPPING = {
    "feature_column": "kind",
    "latitude_column": "lat",
    "longitude_column": "lon",
    "id_column": "biz",
}


def test_latlon_is_projected_to_metres():
    rows = parse_upload((HEADER + ROWS).encode("utf-8"), **LATLON_MAPPING)

    assert len(rows) == 2
    assert rows[0]["lat"] == 39.95
    # Two points ~0.005 deg apart in both axes are a few hundred metres apart.
    span = math.hypot(rows[1]["x"] - rows[0]["x"], rows[1]["y"] - rows[0]["y"])
    assert 600 < span < 750


def test_projection_preserves_distances_of_the_philadelphia_reference():
    """The prepared Philadelphia file carries both degrees and metres.

    Projecting its lat/lon here must reproduce the distances already in its X/Y
    columns, which is what the miner actually consumes.
    """
    import csv

    from server.datasets import _philadelphia_source

    source = _philadelphia_source()
    if source is None:
        pytest.skip("Philadelphia dataset not available")

    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))[:500]

    degrees = [(float(r["latitude"]), float(r["longitude"])) for r in rows]
    existing = [(float(r["X"]), float(r["Y"])) for r in rows]
    projected, _, _ = project_local(degrees)

    for i in range(0, len(rows) - 1, 7):
        j = i + 1
        ours = math.dist(projected[i], projected[j])
        theirs = math.dist(existing[i], existing[j])
        if theirs < 1.0:
            continue
        assert abs(ours - theirs) / theirs < 0.01, f"pair {i},{j}: {ours} vs {theirs}"


def test_xy_columns_are_used_as_given():
    raw = b"name,kind,east,north\nn-1,Cafe,10,20\nn-2,Bar,30,40\n"
    rows = parse_upload(raw, feature_column="kind", x_column="east", y_column="north")

    assert [(r["x"], r["y"]) for r in rows] == [(10.0, 20.0), (30.0, 40.0)]
    assert rows[0]["lat"] is None


def test_a_missing_coordinate_mapping_is_rejected():
    with pytest.raises(UploadError, match="X/Y columns or latitude/longitude"):
        parse_upload((HEADER + ROWS).encode("utf-8"), feature_column="kind")


def test_an_unknown_column_is_named_in_the_error():
    with pytest.raises(UploadError, match="nope"):
        parse_upload(
            (HEADER + ROWS).encode("utf-8"),
            feature_column="kind",
            latitude_column="nope",
            longitude_column="lon",
        )


def test_out_of_range_coordinates_are_rejected():
    raw = (HEADER + "b-1,Cafe,995,-75.16\n").encode("utf-8")
    with pytest.raises(UploadError, match="out of range"):
        parse_upload(raw, **LATLON_MAPPING)


def test_an_oversized_file_is_rejected_before_parsing():
    with pytest.raises(UploadError, match="the limit is"):
        parse_upload(b"x" * (21 * 1024 * 1024), **LATLON_MAPPING)


def test_too_many_instances_are_rejected():
    body = "".join(f"b-{i},Cafe,39.95,-75.16\n" for i in range(MAX_INSTANCES + 2))
    with pytest.raises(UploadError, match="not practical"):
        parse_upload((HEADER + body).encode("utf-8"), **LATLON_MAPPING)


def _rows_with_features(count: int) -> bytes:
    body = "".join(f"b-{i},kind-{i},39.95,-75.16\n" for i in range(count))
    return (HEADER + body).encode("utf-8")


def test_too_many_distinct_features_are_rejected():
    with pytest.raises(UploadError, match="clique enumeration"):
        parse_upload(_rows_with_features(MAX_FEATURES + 1), **LATLON_MAPPING)


def test_exactly_the_feature_limit_is_accepted():
    rows = parse_upload(_rows_with_features(MAX_FEATURES), **LATLON_MAPPING)
    assert len({row["feature"] for row in rows}) == MAX_FEATURES


def test_rows_without_a_feature_are_skipped():
    raw = (HEADER + "b-1,,39.95,-75.16\n" + ROWS).encode("utf-8")
    assert len(parse_upload(raw, **LATLON_MAPPING)) == 2


def test_a_file_with_nothing_usable_is_rejected():
    with pytest.raises(UploadError, match="no rows"):
        parse_upload(HEADER.encode("utf-8"), **LATLON_MAPPING)
