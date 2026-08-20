"""Dataset registry and preparation for the co-location miner.

The miner reads a fixed CSV shape — ``Feature, Instance, LocX, LocY`` with an
integer ``Instance`` — and rebuilds each identifier as ``Feature + number``. It
never sees a business id or a coordinate in degrees. This module owns the
translation in both directions:

* forward, it writes the miner CSV from a source file with arbitrary columns;
* backward, it keeps ``(feature, number) -> record`` so a mined result can be
  put back on the map.

The mapping belongs to the prepared dataset, not to a mining job: every job over
the same dataset shares it. Preparation is cached on disk and only redone when
the source file changes.
"""

from __future__ import annotations

import csv
import json
import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # spatial_web/
SERVER_DATA = ROOT / "backend" / "data"
RUNTIME = Path(os.environ.get("MINING_RUNTIME_DIR") or (ROOT / "backend" / "runtime"))
PREPARED_DIR = RUNTIME / "datasets"

# Sibling projects used as a development fallback when the data has not been
# copied into server/data/ yet.
POI_SIBLING = ROOT.parent / "POI_recommend" / "data" / "yelp" / "philadelphia"
JOINLESS_SIBLING = ROOT.parent / "A-Joinless-Approach-for-Mining-Spatial-Colocation-Patterns"

# Display-only popup columns carried by the cuisine explorer datasets (never mined).
CUISINE_ATTRIBUTES = (
    "is_open", "price", "takeout", "delivery", "outdoor_seating",
    "good_for_kids", "alcohol", "wifi", "ambience", "hours",
)


@dataclass(frozen=True)
class ColumnMap:
    """Which source columns carry which meaning."""

    feature: str
    x: str
    y: str
    latitude: str | None = None
    longitude: str | None = None
    identifier: str | None = None
    # Display-only fields for the explorer (all optional; unset = absent from the
    # instance record, so existing datasets keep their exact shape). name/stars/
    # review_count are first-class (the UI sorts/badges on them); everything in
    # `attributes` is a display-only popup bag that never enters the miner.
    name: str | None = None
    stars: str | None = None
    review_count: str | None = None
    attributes: tuple[str, ...] = ()


@dataclass
class DatasetInfo:
    """A dataset the API can mine."""

    id: str
    label: str
    source: Path
    columns: ColumnMap
    kind: str = "packaged"  # "packaged" or "uploaded"
    description: str = ""


@dataclass
class PreparedDataset:
    """A dataset converted to miner input, with the identity mapping kept."""

    info: DatasetInfo
    miner_csv: Path
    instances: list[dict] = field(default_factory=list)
    feature_counts: dict[str, int] = field(default_factory=dict)

    @property
    def has_latlon(self) -> bool:
        return bool(self.instances) and self.instances[0].get("lat") is not None

    def index(self) -> dict[tuple[str, int], dict]:
        return {(inst["feature"], inst["number"]): inst for inst in self.instances}

    def summary(self) -> dict:
        return {
            "id": self.info.id,
            "label": self.info.label,
            "kind": self.info.kind,
            "description": self.info.description,
            "instance_count": len(self.instances),
            "feature_count": len(self.feature_counts),
            "has_latlon": self.has_latlon,
            "feature_counts": self.feature_counts,
        }


def _first_existing(paths: list[Path | None]) -> Path | None:
    for path in paths:
        if path and Path(path).exists():
            return Path(path)
    return None


def _philadelphia_source() -> Path | None:
    return _first_existing(
        [
            Path(os.environ["PHILADELPHIA_INSTANCES"])
            if os.environ.get("PHILADELPHIA_INSTANCES")
            else None,
            SERVER_DATA / "philadelphia" / "spatial_instances.csv",
            POI_SIBLING / "processed" / "spatial_instances.csv",
        ]
    )


def _philadelphia_cuisine_source() -> Path | None:
    return _first_existing(
        [
            Path(os.environ["PHILADELPHIA_CUISINE_INSTANCES"])
            if os.environ.get("PHILADELPHIA_CUISINE_INSTANCES")
            else None,
            SERVER_DATA / "philadelphia-cuisine" / "spatial_instances.csv",
        ]
    )


def _new_orleans_source() -> Path | None:
    return _first_existing(
        [
            Path(os.environ["NEW_ORLEANS_INSTANCES"])
            if os.environ.get("NEW_ORLEANS_INSTANCES")
            else None,
            SERVER_DATA / "new-orleans" / "spatial_instances.csv",
        ]
    )


def _toronto_source() -> Path | None:
    return _first_existing(
        [
            Path(os.environ["TORONTO_INSTANCES"])
            if os.environ.get("TORONTO_INSTANCES")
            else None,
            SERVER_DATA / "toronto" / "Toronto_x_y_alphabet_version_03.csv",
            JOINLESS_SIBLING / "data" / "Toronto_x_y_alphabet_version_03.csv",
        ]
    )


def builtin_datasets() -> list[DatasetInfo]:
    """Datasets shipped with the app, plus the Toronto fixture when present.

    Philadelphia is the only dataset packaged into the image. Toronto is the
    verification fixture (kappa = 7.8580, 647 patterns) and the only source of a
    coordinates-only dataset in development; it is registered when the sibling
    repository is on disk and simply absent otherwise.
    """
    found: list[DatasetInfo] = []

    philadelphia = _philadelphia_source()
    if philadelphia:
        found.append(
            DatasetInfo(
                id="philadelphia",
                label="Philadelphia (Yelp POI)",
                source=philadelphia,
                columns=ColumnMap(
                    feature="Feature",
                    x="X",
                    y="Y",
                    latitude="latitude",
                    longitude="longitude",
                    identifier="business_id",
                ),
                description="9,928 businesses, 20 categories, coordinates in metres with lat/lon.",
            )
        )

    for cuisine_id, cuisine_label, cuisine_source, cuisine_desc in (
        ("philadelphia-cuisine", "Philadelphia (co-location)",
         _philadelphia_cuisine_source(),
         "Fine-grained cuisine co-location, ~20 features, eps=100 m / min_prev=0.2."),
        ("new-orleans", "New Orleans (co-location)",
         _new_orleans_source(),
         "Fine-grained cuisine co-location, ~19 features, eps=100 m / min_prev=0.2."),
    ):
        if cuisine_source:
            found.append(
                DatasetInfo(
                    id=cuisine_id,
                    label=cuisine_label,
                    source=cuisine_source,
                    columns=ColumnMap(
                        feature="Feature",
                        x="X",
                        y="Y",
                        latitude="latitude",
                        longitude="longitude",
                        identifier="business_id",
                        name="name",
                        stars="stars",
                        review_count="review_count",
                        attributes=CUISINE_ATTRIBUTES,
                    ),
                    description=cuisine_desc,
                )
            )

    toronto = _toronto_source()
    if toronto:
        found.append(
            DatasetInfo(
                id="toronto",
                label="Toronto (verification fixture)",
                source=toronto,
                columns=ColumnMap(feature="Feature", x="X", y="Y"),
                description="17,128 instances, 20 features, coordinates only — no map background.",
            )
        )

    return found


# Bump whenever _read_source changes the instance-record shape, so a prepared
# cache built by older code over a byte-identical source is treated as stale
# instead of silently serving records that lack the new fields.
_RECORD_SCHEMA_VERSION = 2


def _source_fingerprint(source: Path) -> dict:
    stat = source.stat()
    return {
        "size": stat.st_size,
        "mtime_ns": stat.st_mtime_ns,
        "path": str(source),
        "schema": _RECORD_SCHEMA_VERSION,
    }


def prepare(info: DatasetInfo, *, force: bool = False) -> PreparedDataset:
    """Convert a dataset to miner input and build its identity mapping.

    Numbering restarts at 1 per feature, matching how the miner rebuilds ids as
    ``feature + number``. The result is cached under the runtime directory and
    reused until the source file changes.
    """
    target = PREPARED_DIR / info.id
    target.mkdir(parents=True, exist_ok=True)
    miner_csv = target / "miner.csv"
    instances_json = target / "instances.json"
    meta_json = target / "meta.json"

    fingerprint = _source_fingerprint(info.source)
    if not force and miner_csv.exists() and instances_json.exists() and meta_json.exists():
        try:
            cached = json.loads(meta_json.read_text(encoding="utf-8"))
            if cached.get("source") == fingerprint:
                instances = json.loads(instances_json.read_text(encoding="utf-8"))
                return PreparedDataset(
                    info=info,
                    miner_csv=miner_csv,
                    instances=instances,
                    feature_counts=cached["feature_counts"],
                )
        except (ValueError, KeyError, OSError):
            pass  # unreadable cache: rebuild it

    instances = _read_source(info)
    feature_counts: dict[str, int] = {}
    for inst in instances:
        feature_counts[inst["feature"]] = feature_counts.get(inst["feature"], 0) + 1

    # utf-8 without BOM: the miner's CSV reader takes the first header cell
    # literally, and a BOM would turn "Feature" into a column it cannot find.
    with miner_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["Feature", "Instance", "LocX", "LocY"])
        for inst in instances:
            writer.writerow([inst["feature"], inst["number"], inst["x"], inst["y"]])

    instances_json.write_text(json.dumps(instances), encoding="utf-8")
    meta_json.write_text(
        json.dumps({"source": fingerprint, "feature_counts": feature_counts}),
        encoding="utf-8",
    )

    return PreparedDataset(
        info=info,
        miner_csv=miner_csv,
        instances=instances,
        feature_counts=feature_counts,
    )


def _read_source(info: DatasetInfo) -> list[dict]:
    columns = info.columns
    instances: list[dict] = []
    per_feature: dict[str, int] = {}

    # utf-8-sig: several of the prepared source files carry a BOM.
    with info.source.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        # feature/x/y are required; a mapped display column (name/stars/
        # review_count/attributes) must also exist so a mis-mapping fails loudly
        # instead of degrading to silent all-None. lat/lon/identifier keep their
        # historical optional-tolerant behaviour.
        expected = [columns.feature, columns.x, columns.y]
        expected += [c for c in (columns.name, columns.stars, columns.review_count) if c]
        expected += list(columns.attributes)
        missing = [name for name in expected if name not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(
                f"{info.source.name} is missing required column(s): {', '.join(missing)}"
            )

        for row in reader:
            feature = (row.get(columns.feature) or "").strip()
            if not feature:
                continue
            try:
                x = float(row[columns.x])
                y = float(row[columns.y])
            except (TypeError, ValueError):
                continue

            number = per_feature.get(feature, 0) + 1
            per_feature[feature] = number

            record = {
                "feature": feature,
                "number": number,
                "x": x,
                "y": y,
                "lat": _optional_float(row, columns.latitude),
                "lon": _optional_float(row, columns.longitude),
            }
            identifier = row.get(columns.identifier) if columns.identifier else None
            record["id"] = identifier or f"{feature}{number}"
            # Display fields, added only when the dataset maps them, so datasets
            # without them (philadelphia, toronto) keep their exact record shape.
            if columns.name:
                record["name"] = (row.get(columns.name) or "").strip() or None
            if columns.stars:
                record["stars"] = _optional_float(row, columns.stars)
            if columns.review_count:
                record["review_count"] = _optional_int(row, columns.review_count)
            if columns.attributes:
                record["attributes"] = {
                    col: ((row.get(col) or "").strip() or None)
                    for col in columns.attributes
                }
            instances.append(record)

    if not instances:
        raise ValueError(f"{info.source.name} contains no usable rows")
    return instances


def _optional_float(row: dict, column: str | None) -> float | None:
    if not column:
        return None
    try:
        return float(row[column])
    except (TypeError, ValueError, KeyError):
        return None


def _optional_int(row: dict, column: str | None) -> int | None:
    if not column:
        return None
    try:
        return int(float(row[column]))  # tolerate "80" and "80.0"
    except (TypeError, ValueError, KeyError):
        return None


class DatasetRegistry:
    """Holds the known datasets and prepares them on first use."""

    def __init__(self) -> None:
        self._infos: dict[str, DatasetInfo] = {}
        self._prepared: dict[str, PreparedDataset] = {}
        for info in builtin_datasets():
            self._infos[info.id] = info

    def register(self, info: DatasetInfo) -> None:
        """Add a dataset — used by the upload path for temporary datasets."""
        self._infos[info.id] = info
        self._prepared.pop(info.id, None)

    def ids(self) -> list[str]:
        return list(self._infos)

    def info(self, dataset_id: str) -> DatasetInfo | None:
        return self._infos.get(dataset_id)

    def get(self, dataset_id: str) -> PreparedDataset:
        if dataset_id not in self._infos:
            raise KeyError(dataset_id)
        if dataset_id not in self._prepared:
            self._prepared[dataset_id] = prepare(self._infos[dataset_id])
        return self._prepared[dataset_id]

    def summaries(self) -> list[dict]:
        return [self.get(dataset_id).summary() for dataset_id in self._infos]
