"""Shared fixtures: a stand-in miner that the job runner can actually launch."""

from __future__ import annotations

import csv
import json
import sys
import textwrap
from pathlib import Path

import pytest

from server.datasets import ColumnMap, DatasetInfo, prepare

FAKE_MINER = textwrap.dedent(
    '''
    """Stand-in for the C++ miner: same config keys, same stdout stages, same JSON."""
    import json, sys, time
    from pathlib import Path

    config = {}
    for line in Path(sys.argv[1]).read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.startswith("#"):
            key, value = line.split("=", 1)
            config[key.strip()] = value.strip()

    marker = Path(config["json_output_path"]).parent.parent.parent / "invocations.log"
    with marker.open("a", encoding="utf-8") as handle:
        handle.write(config["dataset_path"] + "\\n")

    # Touched continuously while the stand-in is alive, so a test can prove the
    # process really stopped instead of surviving as an orphan.
    heartbeat = marker.parent / "heartbeat"

    hold = float(config.get("hold_seconds", "0"))
    for stage in ("load", "neighbor_graph", "maximal_clique", "mining", "export"):
        print("[stage] " + stage, flush=True)
        deadline = time.time() + hold
        while time.time() < deadline:
            heartbeat.write_text(str(time.time()), encoding="utf-8")
            time.sleep(0.05)

    reported = config.get("report_dataset_path") or config["dataset_path"]
    result = {
        "dataset_path": reported,
        "neighbor_distance": float(config["neighbor_distance"]),
        "min_prevalence": float(config["min_prevalence"]),
        "percentage_instances": float(config["percentage_instances"]),
        "kappa": 2.5,
        "total_instances": 3,
        "peak_memory_mb": 1,
        "timings_s": {"total": 0.01},
        "feature_counts": {"Cafe": 2, "Bar": 1},
        "pattern_count": 1,
        "patterns": [
            {
                "features": ["Bar", "Cafe"],
                "size": 2,
                "wpi": 0.5,
                "deduced": False,
                "participating": {"Bar": [1], "Cafe": [1, 2]},
            }
        ],
    }
    Path(config["json_output_path"]).write_text(json.dumps(result), encoding="utf-8")
    print("[stage] done", flush=True)
    '''
).strip()


@pytest.fixture
def fake_miner(tmp_path) -> Path:
    """A launchable stand-in miner: a .cmd shim on Windows, a shebang script elsewhere."""
    script = tmp_path / "fake_miner.py"
    script.write_text(FAKE_MINER, encoding="utf-8")

    if sys.platform == "win32":
        launcher = tmp_path / "fake_miner.cmd"
        launcher.write_text(f'@echo off\r\n"{sys.executable}" "{script}" %1\r\n', encoding="utf-8")
    else:
        launcher = tmp_path / "fake_miner.sh"
        launcher.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{script}" "$1"\n', encoding="utf-8")
        launcher.chmod(0o755)
    return launcher


@pytest.fixture
def tiny_dataset(tmp_path, monkeypatch):
    """Three instances, two features, prepared into a throwaway runtime directory."""
    source = tmp_path / "tiny.csv"
    with source.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["biz", "kind", "lat", "lon", "east", "north"])
        writer.writerow(["b-1", "Cafe", "39.95", "-75.16", "0.0", "0.0"])
        writer.writerow(["b-2", "Bar", "39.96", "-75.17", "50.0", "0.0"])
        writer.writerow(["b-3", "Cafe", "39.97", "-75.18", "5000.0", "5000.0"])

    monkeypatch.setattr("server.datasets.PREPARED_DIR", tmp_path / "prepared")
    return prepare(
        DatasetInfo(
            id="tiny",
            label="Tiny",
            source=source,
            columns=ColumnMap(
                feature="kind", x="east", y="north",
                latitude="lat", longitude="lon", identifier="biz",
            ),
        )
    )


@pytest.fixture
def runner(tmp_path, monkeypatch, fake_miner):
    """A JobRunner writing into tmp_path, driving the stand-in miner."""
    from server import mining_job

    monkeypatch.setattr(mining_job, "CACHE_DIR", tmp_path / "cache")
    monkeypatch.setattr(mining_job, "JOBS_DIR", tmp_path / "jobs")
    monkeypatch.setenv("MINER_BINARY", str(fake_miner))

    instance = mining_job.JobRunner()
    yield instance
    instance.shutdown()


def invocation_log(tmp_path) -> list[str]:
    path = tmp_path / "invocations.log"
    return path.read_text(encoding="utf-8").splitlines() if path.exists() else []


def load_result(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))
