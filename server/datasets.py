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
SERVER_DATA = ROOT / "server" / "data"
RUNTIME = Path(os.environ.get("MINING_RUNTIME_DIR") or (ROOT / "server" / "runtime"))
PREPARED_DIR = RUNTIME / "datasets"

# Sibling projects used as a development fallback when the data has not been
# copied into server/data/ yet.
POI_SIBLING = ROOT.parent / "POI_recommend" / "data" / "yelp" / "philadelphia"
JOINLESS_SIBLING = ROOT.parent / "A-Joinless-Approach-for-Mining-Spatial-Colocation-Patterns"


@dataclass(frozen=True)
class ColumnMap:
    """Which source columns carry which meaning."""

    feature: str
    x: str
    y: str
    latitude: str | None = None
    longitude: str | None = None
    identifier: str | None = None


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


def _source_fingerprint(source: Path) -> dict:
    stat = source.stat()
    return {"size": stat.st_size, "mtime_ns": stat.st_mtime_ns, "path": str(source)}


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
        missing = [
            name
            for name in (columns.feature, columns.x, columns.y)
            if name not in (reader.fieldnames or [])
        ]
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
