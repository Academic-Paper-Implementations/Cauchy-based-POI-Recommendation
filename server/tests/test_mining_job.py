"""Job runner: config hygiene, cancellation, and the disk cache."""

from __future__ import annotations

import time

import pytest

from server import mining_job
from server.mining_job import (
    JobParams,
    STATUS_CANCELLED,
    STATUS_DONE,
    STATUS_FAILED,
    STATUS_RUNNING,
    cache_key,
    cache_path,
    write_miner_config,
)
from server.tests.conftest import invocation_log

PARAMS = JobParams(dataset_id="tiny", eps_m=120.0, min_prev=0.2, sample_pct=1.0)


def wait_for(predicate, timeout=30.0, interval=0.05):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False


def extra_config_keys(monkeypatch, **extra):
    """Append keys the stand-in miner understands, leaving the real writer intact."""
    original = mining_job.write_miner_config

    def wrapper(path, params, dataset, report_path, json_path):
        original(path, params, dataset, report_path, json_path)
        with path.open("a", encoding="utf-8", newline="\n") as handle:
            for key, value in extra.items():
                handle.write(f"{key}={value}\n")

    monkeypatch.setattr(mining_job, "write_miner_config", wrapper)


# -- config hygiene --------------------------------------------------------


def test_config_has_no_bom_and_unix_newlines(tmp_path, tiny_dataset):
    path = tmp_path / "config.txt"
    write_miner_config(path, PARAMS, tiny_dataset, tmp_path / "r.txt", tmp_path / "r.json")

    raw = path.read_bytes()
    assert not raw.startswith(b"\xef\xbb\xbf"), "a BOM once sent the miner to the wrong file"
    assert b"\r\n" not in raw

    text = raw.decode("utf-8")
    assert f"dataset_path={tiny_dataset.miner_csv.as_posix()}" in text
    assert "neighbor_distance=120.0" in text
    assert "min_prevalence=0.2" in text


# -- happy path and cache --------------------------------------------------


def test_job_runs_and_result_is_cached(runner, tiny_dataset, tmp_path):
    job = runner.submit(PARAMS, tiny_dataset)
    assert wait_for(lambda: job.status == STATUS_DONE), job.error

    assert job.from_cache is False
    assert job.stage == "done"
    assert cache_path(job.result_key).exists()

    result = runner.result(job.id)
    assert result["pattern_count"] == 1
    assert result["patterns"][0]["features"] == ["Bar", "Cafe"]


def test_identical_parameters_are_served_from_cache(runner, tiny_dataset, tmp_path):
    first = runner.submit(PARAMS, tiny_dataset)
    assert wait_for(lambda: first.status == STATUS_DONE), first.error
    assert len(invocation_log(tmp_path)) == 1

    second = runner.submit(PARAMS, tiny_dataset)
    assert second.status == STATUS_DONE
    assert second.from_cache is True
    assert len(invocation_log(tmp_path)) == 1, "cache hit still started the miner"


def test_changed_parameters_re_mine(runner, tiny_dataset, tmp_path):
    first = runner.submit(PARAMS, tiny_dataset)
    assert wait_for(lambda: first.status == STATUS_DONE), first.error

    other = JobParams(dataset_id="tiny", eps_m=120.0, min_prev=0.4, sample_pct=1.0)
    second = runner.submit(other, tiny_dataset)
    assert second.from_cache is False
    assert wait_for(lambda: second.status == STATUS_DONE), second.error
    assert len(invocation_log(tmp_path)) == 2
    assert cache_key(PARAMS, tiny_dataset) != cache_key(other, tiny_dataset)


def test_clear_cache_forces_a_re_run(runner, tiny_dataset, tmp_path):
    first = runner.submit(PARAMS, tiny_dataset)
    assert wait_for(lambda: first.status == STATUS_DONE), first.error

    assert runner.clear_cache() == 1
    second = runner.submit(PARAMS, tiny_dataset)
    assert second.from_cache is False
    assert wait_for(lambda: second.status == STATUS_DONE), second.error


# -- cancellation ----------------------------------------------------------


def test_cancel_kills_the_child_and_leaves_no_cache(runner, tiny_dataset, monkeypatch, tmp_path):
    extra_config_keys(monkeypatch, hold_seconds=20)

    job = runner.submit(PARAMS, tiny_dataset)
    heartbeat = tmp_path / "heartbeat"
    assert wait_for(heartbeat.exists), "stand-in miner never started"
    process = runner._process

    assert runner.cancel(job.id) is True
    assert job.status == STATUS_CANCELLED
    assert process.poll() is not None, "child process outlived its job"
    assert not cache_path(job.result_key).exists(), "cancelled job left a cache entry"

    # The whole tree must be gone, not just the process the runner launched:
    # nothing may still be touching the heartbeat a moment later.
    settled = heartbeat.stat().st_mtime_ns
    time.sleep(1.0)
    assert heartbeat.stat().st_mtime_ns == settled, "an orphaned process is still running"


def test_a_new_job_replaces_the_running_one(runner, tiny_dataset, monkeypatch):
    extra_config_keys(monkeypatch, hold_seconds=20)

    first = runner.submit(PARAMS, tiny_dataset)
    assert wait_for(lambda: runner._process is not None)
    first_process = runner._process

    other = JobParams(dataset_id="tiny", eps_m=200.0, min_prev=0.2, sample_pct=1.0)
    second = runner.submit(other, tiny_dataset)

    assert first.status == STATUS_CANCELLED
    assert first_process.poll() is not None
    assert second.status == STATUS_RUNNING
    runner.cancel(second.id)


def test_simultaneous_submits_leave_exactly_one_live_process(
    runner, tiny_dataset, monkeypatch
):
    """Two requests arriving together must not orphan a miner."""
    import threading

    extra_config_keys(monkeypatch, hold_seconds=20)

    started = []
    barrier = threading.Barrier(2)

    def submit(eps):
        params = JobParams(dataset_id="tiny", eps_m=eps, min_prev=0.2, sample_pct=1.0)
        barrier.wait()
        started.append(runner.submit(params, tiny_dataset))

    threads = [threading.Thread(target=submit, args=(eps,)) for eps in (300.0, 400.0)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert len(started) == 2
    running = [job for job in started if job.status == STATUS_RUNNING]
    assert len(running) == 1, [job.status for job in started]

    runner.cancel_current()
    assert all(job.status != STATUS_RUNNING for job in started)


def test_shutdown_stops_the_running_child(runner, tiny_dataset, monkeypatch):
    extra_config_keys(monkeypatch, hold_seconds=20)

    job = runner.submit(PARAMS, tiny_dataset)
    assert wait_for(lambda: runner._process is not None)
    process = runner._process

    runner.shutdown()
    assert process.poll() is not None
    assert job.status == STATUS_CANCELLED


# -- failure modes ---------------------------------------------------------


def test_wrong_dataset_in_the_output_fails_the_job(runner, tiny_dataset, monkeypatch):
    extra_config_keys(monkeypatch, report_dataset_path="/somewhere/else.csv")

    job = runner.submit(PARAMS, tiny_dataset)
    assert wait_for(lambda: job.status in (STATUS_DONE, STATUS_FAILED))
    assert job.status == STATUS_FAILED
    assert "asked for" in job.error
    assert not cache_path(job.result_key).exists()


def test_missing_binary_fails_the_job_with_build_instructions(
    runner, tiny_dataset, monkeypatch, tmp_path
):
    monkeypatch.setenv("MINER_BINARY", str(tmp_path / "not-built"))
    job = runner.submit(PARAMS, tiny_dataset)
    assert job.status == STATUS_FAILED
    assert "g++" in job.error


def test_result_is_none_until_the_job_finishes(runner, tiny_dataset, monkeypatch):
    extra_config_keys(monkeypatch, hold_seconds=20)
    job = runner.submit(PARAMS, tiny_dataset)
    assert runner.result(job.id) is None
    runner.cancel(job.id)
    assert runner.result(job.id) is None
