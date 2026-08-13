"""User-supplied datasets: validate, project, and register as a temporary dataset.

The miner measures Euclidean distance on plain coordinates, so degrees have to
become metres before it sees them. A local flat projection around the dataset's
own centre is enough at city scale and adds no dependency:

    x = R * (lon - lon0) * cos(lat0)
    y = R * (lat - lat0)

It is not a general-purpose projection. Across a span of hundreds of kilometres
the east-west scale drifts with latitude, which is documented in the README
rather than hidden.

An upload is written into the runtime directory as a normalised CSV and
registered beside the packaged datasets, so the job path never has to know where
a dataset came from.
"""

from __future__ import annotations

import csv
import io
import math
import uuid

from .datasets import ColumnMap, DatasetInfo, RUNTIME

UPLOAD_DIR = RUNTIME / "uploads"

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_INSTANCES = 50_000
# The miner enumerates cliques over the feature set, and that enumeration grows
# combinatorially with the number of distinct features — a wide file does not run
# slowly, it does not finish. Rejecting it here is kinder than accepting an upload
# nobody can mine.
MAX_FEATURES = 64
EARTH_RADIUS_M = 6_371_008.8


class UploadError(ValueError):
    """A rejected upload, with a message meant for the person who sent it."""


def project_local(
    points: list[tuple[float, float]]
) -> tuple[list[tuple[float, float]], float, float]:
    """Project (lat, lon) degrees to metres around the centre of the points."""
    if not points:
        raise UploadError("no rows with usable coordinates")

    lat0 = sum(lat for lat, _ in points) / len(points)
    lon0 = sum(lon for _, lon in points) / len(points)
    cos_lat0 = math.cos(math.radians(lat0))

    projected = [
        (
            EARTH_RADIUS_M * math.radians(lon - lon0) * cos_lat0,
            EARTH_RADIUS_M * math.radians(lat - lat0),
        )
        for lat, lon in points
    ]
    return projected, lat0, lon0


def _column(row: dict, name: str | None) -> str | None:
    if not name:
        return None
    value = row.get(name)
    return value.strip() if isinstance(value, str) else value


def _to_float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_upload(
    raw: bytes,
    *,
    feature_column: str,
    x_column: str | None = None,
    y_column: str | None = None,
    latitude_column: str | None = None,
    longitude_column: str | None = None,
    id_column: str | None = None,
) -> list[dict]:
    """Read the uploaded bytes into rows with both metres and, when given, degrees.

    Either projected coordinates or lat/lon must be present. When only lat/lon is
    given, metres are derived; when only x/y is given, the dataset stays on the
    scatter view because there is nothing to put a street map under.
    """
    if len(raw) > MAX_UPLOAD_BYTES:
        raise UploadError(
            f"file is {len(raw) / 1024 / 1024:.1f} MB; the limit is "
            f"{MAX_UPLOAD_BYTES // 1024 // 1024} MB"
        )

    has_xy = bool(x_column and y_column)
    has_latlon = bool(latitude_column and longitude_column)
    if not has_xy and not has_latlon:
        raise UploadError("map either X/Y columns or latitude/longitude columns")

    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise UploadError("file is not valid UTF-8 text") from error

    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    required = [feature_column] + [
        name
        for name in (x_column, y_column, latitude_column, longitude_column, id_column)
        if name
    ]
    missing = [name for name in required if name not in headers]
    if missing:
        raise UploadError(f"column(s) not found in the file: {', '.join(missing)}")

    rows: list[dict] = []
    degrees: list[tuple[float, float]] = []
    seen_features: set[str] = set()

    for record in reader:
        feature = _column(record, feature_column)
        if not feature:
            continue

        lat = _to_float(_column(record, latitude_column)) if has_latlon else None
        lon = _to_float(_column(record, longitude_column)) if has_latlon else None
        if has_latlon and (lat is None or lon is None):
            continue
        if has_latlon and not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise UploadError(
                f"latitude/longitude out of range: {lat}, {lon} — check the column mapping"
            )

        x = _to_float(_column(record, x_column)) if has_xy else None
        y = _to_float(_column(record, y_column)) if has_xy else None
        if has_xy and (x is None or y is None):
            continue

        seen_features.add(feature)
        if len(seen_features) > MAX_FEATURES:
            raise UploadError(
                f"more than {MAX_FEATURES} distinct features in {feature_column!r}; "
                "clique enumeration grows combinatorially with the feature count, so "
                "a file this wide cannot be mined. Check that the column holds "
                "categories rather than names or ids."
            )

        rows.append(
            {
                "feature": feature,
                "id": _column(record, id_column) or "",
                "lat": lat,
                "lon": lon,
                "x": x,
                "y": y,
            }
        )
        if has_latlon:
            degrees.append((lat, lon))

        if len(rows) > MAX_INSTANCES:
            raise UploadError(
                f"more than {MAX_INSTANCES:,} instances; mining that many is not "
                "practical in this app"
            )

    if not rows:
        raise UploadError("no rows with a feature and usable coordinates")

    if not has_xy:
        projected, _, _ = project_local(degrees)
        for row, (x, y) in zip(rows, projected):
            row["x"] = x
            row["y"] = y

    return rows


def store_upload(rows: list[dict], label: str) -> DatasetInfo:
    """Write the normalised CSV and describe it as a registrable dataset."""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dataset_id = f"upload-{uuid.uuid4().hex[:8]}"
    path = UPLOAD_DIR / f"{dataset_id}.csv"

    has_latlon = rows[0]["lat"] is not None
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["Feature", "Label", "latitude", "longitude", "X", "Y"])
        for row in rows:
            writer.writerow(
                [row["feature"], row["id"], row["lat"], row["lon"], row["x"], row["y"]]
            )

    return DatasetInfo(
        id=dataset_id,
        label=label or "Uploaded dataset",
        source=path,
        columns=ColumnMap(
            feature="Feature",
            x="X",
            y="Y",
            latitude="latitude" if has_latlon else None,
            longitude="longitude" if has_latlon else None,
            identifier="Label",
        ),
        kind="uploaded",
        description=(
            f"{len(rows):,} instances uploaded in this session"
            + ("" if has_latlon else " — projected coordinates only, no map background")
        ),
    )
