"""API surface: the job lifecycle a browser drives, end to end."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from backend import main, mining_job
from backend.tests.conftest import invocation_log


@pytest.fixture
def client(tmp_path, monkeypatch, fake_miner, tiny_dataset):
    monkeypatch.setattr(mining_job, "CACHE_DIR", tmp_path / "cache")
    monkeypatch.setattr(mining_job, "JOBS_DIR", tmp_path / "jobs")
    monkeypatch.setenv("MINER_BINARY", str(fake_miner))

    runner = mining_job.JobRunner()
    monkeypatch.setattr(main, "RUNNER", runner)
    main.REGISTRY.register(tiny_dataset.info)
    main._INDEX_CACHE.clear()
    main._GRID_CACHE.clear()

    with TestClient(main.app) as test_client:
        yield test_client
    runner.shutdown()
    main.REGISTRY._infos.pop("tiny", None)


def run_to_completion(client, **overrides) -> str:
    body = {"dataset_id": "tiny", "eps_m": 120.0, "min_prev": 0.2, "sample_pct": 1.0}
    body.update(overrides)
    job_id = client.post("/api/jobs", json=body).json()["job_id"]

    deadline = time.time() + 30
    while time.time() < deadline:
        status = client.get(f"/api/jobs/{job_id}").json()
        if status["status"] in ("done", "failed", "cancelled"):
            assert status["status"] == "done", status["error"]
            return job_id
        time.sleep(0.05)
    raise AssertionError("job never finished")


def test_health_reports_whether_the_miner_is_built(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert "miner_binary" in body


def test_datasets_are_listed_with_their_shape(client):
    body = client.get("/api/datasets").json()
    tiny = next(d for d in body["datasets"] if d["id"] == "tiny")
    assert tiny["instance_count"] == 3
    assert tiny["feature_count"] == 2
    assert tiny["has_latlon"] is True


def test_instances_endpoint_serves_map_points(client):
    body = client.get("/api/datasets/tiny/instances").json()
    assert body["count"] == 3
    first = body["instances"][0]
    assert {"feature", "number", "id", "lat", "lon", "x", "y"} <= set(first)


def test_unknown_dataset_is_a_404(client):
    assert client.get("/api/datasets/nope/instances").status_code == 404


def test_job_runs_and_serves_a_result(client):
    job_id = run_to_completion(client)
    body = client.get(f"/api/jobs/{job_id}/result").json()

    assert body["pattern_count"] == 1
    assert body["kappa"] == 2.5
    assert body["patterns"][0]["participation_counts"] == {"Bar": 1, "Cafe": 2}


def test_rare_threshold_relabels_without_re_mining(client, tmp_path):
    job_id = run_to_completion(client)
    assert len(invocation_log(tmp_path)) == 1

    wide = client.get(f"/api/jobs/{job_id}/result", params={"rare_percentile": 100}).json()
    narrow = client.get(
        f"/api/jobs/{job_id}/result",
        params={"rare_percentile": 0, "rare_min_count": 0},
    ).json()

    assert wide["rare_features"] == ["Bar", "Cafe"]
    assert narrow["rare_features"] == ["Bar"]
    assert len(invocation_log(tmp_path)) == 1, "changing the rare threshold re-ran the miner"


def test_repeating_a_job_is_served_from_cache(client, tmp_path):
    run_to_completion(client)
    body = client.post(
        "/api/jobs",
        json={"dataset_id": "tiny", "eps_m": 120.0, "min_prev": 0.2, "sample_pct": 1.0},
    ).json()

    assert body["status"] == "done"
    assert body["from_cache"] is True
    assert len(invocation_log(tmp_path)) == 1


def test_instance_query_returns_patterns_and_neighbours(client):
    job_id = run_to_completion(client)
    body = client.get(f"/api/jobs/{job_id}/instances/Cafe/1").json()

    assert body["pattern_count"] == 1
    pattern = body["patterns"][0]
    assert pattern["features"] == ["Bar", "Cafe"]
    assert [n["id"] for n in pattern["neighbors"]] == ["b-2"]
    assert body["instance"]["id"] == "b-1"


def test_instance_query_rejects_an_unknown_point(client):
    job_id = run_to_completion(client)
    assert client.get(f"/api/jobs/{job_id}/instances/Cafe/99").status_code == 404


def test_result_of_an_unfinished_job_is_a_conflict(client, monkeypatch):
    from backend.tests.test_mining_job import extra_config_keys

    extra_config_keys(monkeypatch, hold_seconds=20)
    job_id = client.post(
        "/api/jobs",
        json={"dataset_id": "tiny", "eps_m": 900.0, "min_prev": 0.2, "sample_pct": 1.0},
    ).json()["job_id"]

    assert client.get(f"/api/jobs/{job_id}/result").status_code == 409

    cancelled = client.delete(f"/api/jobs/{job_id}").json()
    assert cancelled["status"] == "cancelled"


def test_cache_can_be_cleared(client, tmp_path):
    run_to_completion(client)
    assert client.delete("/api/cache").json()["removed"] == 1

    run_to_completion(client)
    assert len(invocation_log(tmp_path)) == 2
