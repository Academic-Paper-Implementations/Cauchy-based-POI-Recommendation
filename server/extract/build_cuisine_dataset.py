"""Build packaged cuisine co-location datasets (Philadelphia, New Orleans).

Reads raw Yelp ``business.json`` (business data only), keeps food/leisure
businesses per city, assigns each a single **most-specific** cuisine label from
an intentful ~20-feature vocabulary (common cuisines + the city's rare-signature
cuisines), projects coordinates to metres, and writes a packaged
``spatial_instances.csv`` shaped exactly like ``server/data/philadelphia/`` plus
display-only attribute columns for the explorer popup.

Why ~20 features: the vendored clique miner does not finish on Philadelphia past
about 20 features at a useful neighbour distance (measured feasibility spike).
Mining defaults baked into the manifest are ``eps=100 m, min_prev=0.2``.

The attributes are display-only and never enter the miner: the miner path reads
only ``Feature, X, Y`` (+ ``business_id`` for identity). A missing attribute is
serialised as an empty cell (later shown as "unknown"), never as "No".

CLI::

    python -m server.extract.build_cuisine_dataset --city all
    python -m server.extract.build_cuisine_dataset --city philadelphia-cuisine
"""
from __future__ import annotations

import argparse
import ast
import csv
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path

from server.upload import project_local  # single canonical lat/lon -> metres projection

ROOT = Path(__file__).resolve().parents[2]  # spatial_web/
BUSINESS_JSON = ROOT / "data" / "yelp_raw" / "yelp_academic_dataset_business.json"
SERVER_DATA = ROOT / "server" / "data"

BUDGET = 20  # Phase-1 locked feature budget (per city)
FLOOR = 30   # min instances per feature (stabilises WPI/kappa; matches DEFAULT_MIN_COUNT)
MINING_DEFAULTS = {"eps_m": 100.0, "min_prev": 0.2}

# A business counts as food/leisure if it carries at least one of these roots.
FOOD_LEISURE_ROOTS = {
    "Restaurants", "Food", "Nightlife", "Bars", "Arts & Entertainment", "Active Life",
}
# Broad roots / non-cuisine umbrellas excluded from being a *feature* label.
BROAD_EXCLUDE = {
    "Restaurants", "Food", "Nightlife", "Bars", "Arts & Entertainment", "Active Life",
    "Shopping", "Event Planning & Services", "Local Flavor", "Beauty & Spas",
    "Hotels & Travel", "Automotive", "Home Services", "Health & Medical",
    "Professional Services", "Public Services & Government", "Local Services",
    "Financial Services", "Education", "Religious Organizations", "Mass Media",
    "Pets", "Real Estate", "Hotels", "Fashion",
}

# Display attributes carried to the popup. Yelp key -> output column + parser kind.
# kind: "bool" (True/False/None), "price" (1..4), "enum" (u'free' -> free),
#       "ambience" (stringified dict of bools -> pipe-joined true traits).
ATTRIBUTE_SPEC = [
    ("RestaurantsPriceRange2", "price", "price"),
    ("RestaurantsTakeOut", "takeout", "bool"),
    ("RestaurantsDelivery", "delivery", "bool"),
    ("OutdoorSeating", "outdoor_seating", "bool"),
    ("GoodForKids", "good_for_kids", "bool"),
    ("Alcohol", "alcohol", "enum"),
    ("WiFi", "wifi", "enum"),
    ("Ambience", "ambience", "ambience"),
]
ATTRIBUTE_COLUMNS = [col for _, col, _ in ATTRIBUTE_SPEC] + ["hours"]

# Packaged CSV header: the existing philadelphia shape + POI name + attributes.
# `name` is new vs the old dataset — the explorer popup needs it; the miner path
# ignores every column except Feature/X/Y (+ business_id for identity).
BASE_COLUMNS = [
    "instance_id", "business_id", "name", "Feature", "InstanceID", "category",
    "latitude", "longitude", "X", "Y", "city", "state",
    "stars", "review_count", "is_open",
]
CSV_COLUMNS = BASE_COLUMNS + ATTRIBUTE_COLUMNS


@dataclass(frozen=True)
class CityConfig:
    """A packaged city dataset to build."""

    dataset_id: str          # server/data/<dataset_id>/
    label: str
    city_name: str           # business.json `city`, lowercased for matching
    state: str
    # Rare-signature cuisines to guarantee in the vocabulary when they clear the
    # floor — they carry the thesis's rare-co-location identity for the city.
    signature: tuple[str, ...] = ()


CITIES: dict[str, CityConfig] = {
    "philadelphia-cuisine": CityConfig(
        dataset_id="philadelphia-cuisine",
        label="Philadelphia (cuisine co-location)",
        city_name="philadelphia",
        state="PA",
        signature=("Cheesesteaks", "Soul Food", "Vietnamese", "Korean"),
    ),
    "new-orleans": CityConfig(
        dataset_id="new-orleans",
        label="New Orleans (cuisine co-location)",
        city_name="new orleans",
        state="LA",
        signature=("Cajun/Creole", "Southern", "Seafood"),
    ),
}


@dataclass
class Business:
    id: str
    name: str
    lat: float
    lon: float
    cats: list[str]
    attrs: dict
    hours: dict
    stars: float | None
    review_count: int | None
    is_open: int | None
    feature: str = ""  # assigned single-label
    x: float = field(default=0.0)
    y: float = field(default=0.0)


# --------------------------------------------------------------------------- #
# Attribute parsing
# --------------------------------------------------------------------------- #

def _lit(value):
    """Best-effort parse of a Yelp attribute string (u'x', 'x', {'k': False})."""
    if value is None:
        return None
    if not isinstance(value, str):
        return value
    v = value.strip()
    if v in ("", "None"):
        return None
    try:
        return ast.literal_eval(v)
    except (ValueError, SyntaxError):
        return v


def _bool_cell(value) -> str:
    parsed = _lit(value)
    if parsed is True:
        return "true"
    if parsed is False:
        return "false"
    return ""  # unknown — never "No"


def _price_cell(value) -> str:
    parsed = _lit(value)
    try:
        n = int(parsed)
    except (TypeError, ValueError):
        return ""
    return str(n) if 1 <= n <= 4 else ""


def _enum_cell(value) -> str:
    """Enum attribute (Alcohol/WiFi). Keep 'none'/'no' — they are real values
    ("serves no alcohol", "no wifi"); only a missing/empty attribute is unknown.
    """
    parsed = _lit(value)  # missing/"None" -> None
    if not isinstance(parsed, str):
        return ""
    p = parsed.strip().lower()
    return "" if p == "" else p


def _ambience_cell(value) -> str:
    parsed = _lit(value)
    if not isinstance(parsed, dict):
        return ""
    return "|".join(sorted(k for k, v in parsed.items() if v is True))


def parse_attributes(attrs: dict, hours: dict) -> dict:
    """Extract display-only attribute cells. Missing -> "" (shown as unknown)."""
    attrs = attrs or {}
    out: dict[str, str] = {}
    for yelp_key, col, kind in ATTRIBUTE_SPEC:
        raw = attrs.get(yelp_key)
        if kind == "bool":
            out[col] = _bool_cell(raw)
        elif kind == "price":
            out[col] = _price_cell(raw)
        elif kind == "enum":
            out[col] = _enum_cell(raw)
        elif kind == "ambience":
            out[col] = _ambience_cell(raw)
    out["hours"] = json.dumps(hours, ensure_ascii=False) if hours else ""
    return out


# --------------------------------------------------------------------------- #
# Extraction
# --------------------------------------------------------------------------- #

def load_city_businesses(business_json: Path, cfg: CityConfig) -> list[Business]:
    """Stream business.json; keep food/leisure businesses in the target city."""
    kept: list[Business] = []
    with business_json.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            b = json.loads(line)
            if (b.get("state") or "") != cfg.state:
                continue
            if (b.get("city") or "").strip().lower() != cfg.city_name:
                continue
            cats = [c.strip() for c in (b.get("categories") or "").split(",") if c.strip()]
            if not (set(cats) & FOOD_LEISURE_ROOTS):
                continue
            lat, lon = b.get("latitude"), b.get("longitude")
            if lat is None or lon is None:
                continue
            kept.append(Business(
                id=b["business_id"], name=b.get("name") or "",
                lat=float(lat), lon=float(lon), cats=cats,
                attrs=b.get("attributes") or {}, hours=b.get("hours") or {},
                stars=b.get("stars"), review_count=b.get("review_count"),
                is_open=b.get("is_open"),
            ))
    return kept


def global_category_counts(businesses: list[Business]) -> dict[str, int]:
    """Global count of every candidate cuisine tag over the food/leisure set."""
    counts: dict[str, int] = {}
    for b in businesses:
        for c in b.cats:
            if c in BROAD_EXCLUDE:
                continue
            counts[c] = counts.get(c, 0) + 1
    return counts


def build_vocabulary(counts: dict[str, int], cfg: CityConfig) -> list[str]:
    """Intentful ~BUDGET vocabulary: signature cuisines first, then top common.

    Every entry clears the floor. Signature cuisines are guaranteed a slot when
    eligible (that is the point — they carry the city's rare identity); the rest
    of the budget is filled with the most common cuisines by global count. This
    is deterministic and objective given the counts + the documented signatures.
    """
    eligible = {t: n for t, n in counts.items() if n >= FLOOR}
    vocab: list[str] = [t for t in cfg.signature if t in eligible]
    # Highest count first; tag name as a secondary key so ties are resolved
    # independently of raw-file line order (fully deterministic on content).
    for tag in sorted(eligible, key=lambda t: (-eligible[t], t)):
        if len(vocab) >= BUDGET:
            break
        if tag not in vocab:
            vocab.append(tag)
    return vocab[:BUDGET]


def most_specific_label(cats: list[str], vocab: set[str], counts: dict[str, int]) -> str | None:
    """Single label = the in-vocabulary tag with the LOWEST global count.

    Lowest global count = most specific (a rare cuisine outranks a common one),
    so a Vietnamese restaurant also tagged "Restaurants, Food" labels Vietnamese.
    """
    present = [c for c in cats if c in vocab]
    if not present:
        return None
    # Lowest global count = most specific; tag name breaks ties deterministically.
    return min(present, key=lambda c: (counts[c], c))


def kappa(feature_instance_counts: list[int]) -> float:
    """Global Pairwise Dispersion, replicating engine ``calculateDispersion``.

    kappa = 2/(m(m-1)) * sum_{i<j} freq[j]/freq[i] over ascending per-feature
    instance counts. Computed on the single-label features of the built dataset.
    """
    freqs = sorted(float(c) for c in feature_instance_counts if c > 0)
    m = len(freqs)
    if m < 2:
        return 0.0
    total = 0.0
    for i in range(m):
        for j in range(i + 1, m):
            total += freqs[j] / freqs[i]
    return (2.0 / (m * (m - 1))) * total


# --------------------------------------------------------------------------- #
# Build
# --------------------------------------------------------------------------- #

def _source_fingerprint(path: Path) -> str:
    stat = path.stat()
    material = json.dumps({"size": stat.st_size, "mtime_ns": stat.st_mtime_ns},
                          sort_keys=True)
    return hashlib.sha1(material.encode("utf-8")).hexdigest()


def _slug(feature: str) -> str:
    return feature.lower().replace(" ", "_").replace("/", "_").replace("&", "and")


def build_city(cfg: CityConfig, business_json: Path, out_root: Path) -> dict:
    """Build one packaged dataset; returns a manifest dict (also written to disk)."""
    businesses = load_city_businesses(business_json, cfg)
    if not businesses:
        raise SystemExit(f"no food/leisure businesses found for {cfg.dataset_id}")

    counts = global_category_counts(businesses)
    vocab = build_vocabulary(counts, cfg)
    vocab_set = set(vocab)

    labelled: list[Business] = []
    for b in businesses:
        feature = most_specific_label(b.cats, vocab_set, counts)
        if feature is None:
            continue  # no in-vocabulary cuisine: drop (cannot label)
        b.feature = feature
        labelled.append(b)

    # Enforce floor >= 30 on the ACTUAL single-label instance counts (not the
    # global tag counts: most-specific labelling can starve a common cuisine).
    # Done BEFORE projecting so the projection centre and manifest describe
    # exactly the emitted instances, not a superset.
    feature_counts: dict[str, int] = {}
    for b in labelled:
        feature_counts[b.feature] = feature_counts.get(b.feature, 0) + 1
    below_floor = {f for f, n in feature_counts.items() if n < FLOOR}
    if below_floor:
        labelled = [b for b in labelled if b.feature not in below_floor]
        feature_counts = {f: n for f, n in feature_counts.items() if f not in below_floor}

    # Project the surviving points about the city's own centre (fixed per city).
    projected, lat0, lon0 = project_local([(b.lat, b.lon) for b in labelled])
    for b, (x, y) in zip(labelled, projected):
        b.x, b.y = x, y

    out_dir = out_root / cfg.dataset_id
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / "spatial_instances.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for b in labelled:
            row = {
                "instance_id": f"{b.id}__{_slug(b.feature)}",
                "business_id": b.id,
                "name": b.name,
                "Feature": b.feature,
                "InstanceID": b.id,
                "category": b.feature,
                "latitude": f"{b.lat:.7f}",
                "longitude": f"{b.lon:.7f}",
                "X": f"{b.x:.6f}",
                "Y": f"{b.y:.6f}",
                "city": cfg.label.split(" (")[0],
                "state": cfg.state,
                "stars": "" if b.stars is None else b.stars,
                "review_count": "" if b.review_count is None else b.review_count,
                "is_open": "" if b.is_open is None else b.is_open,
            }
            row.update(parse_attributes(b.attrs, b.hours))
            writer.writerow(row)

    manifest = {
        "dataset_id": cfg.dataset_id,
        "label": cfg.label,
        "city": cfg.city_name,
        "state": cfg.state,
        "source": business_json.relative_to(ROOT).as_posix(),
        "source_fingerprint": _source_fingerprint(business_json),
        "projection_center": {"lat0": lat0, "lon0": lon0},
        "mining_defaults": MINING_DEFAULTS,
        "instance_count": len(labelled),
        "feature_count": len(feature_counts),
        "kappa": round(kappa(list(feature_counts.values())), 6),
        "floor": FLOOR,
        "budget": BUDGET,
        "signature_included": [s for s in cfg.signature if s in feature_counts],
        "feature_counts": dict(sorted(feature_counts.items(), key=lambda kv: -kv[1])),
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--city", default="all",
                    choices=["all", *CITIES.keys()])
    ap.add_argument("--business-json", type=Path, default=BUSINESS_JSON)
    ap.add_argument("--out-root", type=Path, default=SERVER_DATA)
    args = ap.parse_args(argv)

    targets = list(CITIES.values()) if args.city == "all" else [CITIES[args.city]]
    for cfg in targets:
        m = build_city(cfg, args.business_json, args.out_root)
        print(f"[{m['dataset_id']}] {m['instance_count']} instances, "
              f"{m['feature_count']} features, kappa={m['kappa']}, "
              f"signature={m['signature_included']}")
        print("  features: " + ", ".join(
            f"{f}({n})" for f, n in m["feature_counts"].items()))


if __name__ == "__main__":
    main()
