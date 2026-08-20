"""Mining job lifecycle: disk cache, subprocess, progress, cancellation.

A single mine over a city-sized dataset can run for tens of minutes, which
shapes every decision here:

* results are cached on disk by ``(dataset, eps, min_prev, sample_pct)`` and
  survive a restart, so repeating a run is free;
* only a completed run is cached — a cancelled job must leave nothing behind
  that a later request would mistake for a finished result;
* one job runs at a time, and a new one only starts once the previous child
  process is confirmed dead.

``min_prev`` is a job parameter, not a post-filter. The miner accepts subsets
through Lemma 2 without computing their WPI, so re-filtering a low-threshold
result at a higher threshold would silently drop patterns that have no WPI to
compare. Changing it re-mines.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import signal
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from .datasets import PreparedDataset, RUNTIME

CACHE_DIR = RUNTIME / "cache"
JOBS_DIR = RUNTIME / "jobs"

STATUS_QUEUED = "queued"
STATUS_RUNNING = "running"
STATUS_DONE = "done"
STATUS_CANCELLED = "cancelled"
STATUS_FAILED = "failed"

# Ordered as the miner reaches them, for a UI that wants to show position.
STAGES = ["load", "neighbor_graph", "maximal_clique", "mining", "export", "done"]


def _spawn_isolated(command: list[str], cwd: str) -> subprocess.Popen:
    """Start the miner in its own process group so it can be killed as a tree."""
    extra: dict = {}
    if os.name == "nt":
        extra["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        extra["start_new_session"] = True

    return subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        cwd=cwd,
        **extra,
    )


def terminate_tree(process: subprocess.Popen) -> None:
    """Kill the miner and anything it started, then wait for it to be reaped.

    Killing only the direct child would leave a grandchild running and holding
    the CPU for the rest of the session. Results are published through an atomic
    rename, so a forceful kill cannot corrupt anything.
    """
    if process.poll() is not None:
        return

    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                capture_output=True,
                check=False,
            )
        else:
            os.killpg(os.getpgid(process.pid), signal.SIGTERM)
    except (OSError, subprocess.SubprocessError):
        pass

    try:
        process.wait(timeout=5)
        return
    except subprocess.TimeoutExpired:
        pass

    try:
        if os.name != "nt":
            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
        else:
            process.kill()
    except (OSError, subprocess.SubprocessError):
        pass

    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass


def miner_binary() -> Path:
    """Locate the compiled miner."""
    override = os.environ.get("MINER_BINARY")
    if override:
        return Path(override)
    engine_bin = Path(__file__).resolve().parent / "engine" / "bin"
    windows = engine_bin / "colocation_miner.exe"
    return windows if windows.exists() else engine_bin / "colocation_miner"


@dataclass(frozen=True)
class JobParams:
    dataset_id: str
    eps_m: float
    min_prev: float
    sample_pct: float = 1.0

    def as_dict(self) -> dict:
        return {
            "dataset_id": self.dataset_id,
            "eps_m": self.eps_m,
            "min_prev": self.min_prev,
            "sample_pct": self.sample_pct,
        }


def cache_key(params: JobParams, dataset: PreparedDataset) -> str:
    """Identify a run by its parameters and the exact input file it reads.

    The miner CSV's size and mtime are part of the key: re-preparing a dataset
    from a changed source must not hand back the previous run's patterns.
    """
    stat = dataset.miner_csv.stat()
    material = json.dumps(
        {
            **params.as_dict(),
            "input_size": stat.st_size,
            "input_mtime_ns": stat.st_mtime_ns,
        },
        sort_keys=True,
    )
    return hashlib.sha1(material.encode("utf-8")).hexdigest()


def cache_path(key: str) -> Path:
    return CACHE_DIR / f"{key}.json"


@dataclass
class MiningJob:
    id: str
    params: JobParams
    status: str = STATUS_QUEUED
    stage: str = ""
    from_cache: bool = False
    error: str = ""
    created_at: float = field(default_factory=time.time)
    finished_at: float | None = None
    result_key: str = ""

    def elapsed_s(self) -> float:
        end = self.finished_at if self.finished_at is not None else time.time()
        return round(end - self.created_at, 3)

    def as_dict(self) -> dict:
        return {
            "job_id": self.id,
            "status": self.status,
            "stage": self.stage,
            "stage_index": STAGES.index(self.stage) if self.stage in STAGES else -1,
            "stage_count": len(STAGES),
            "from_cache": self.from_cache,
            "elapsed_s": self.elapsed_s(),
            "error": self.error,
            "params": self.params.as_dict(),
        }


def write_miner_config(path: Path, params: JobParams, dataset: PreparedDataset,
                       report_path: Path, json_path: Path) -> None:
    """Write the miner's key=value config.

    Written as plain UTF-8 with no BOM and Unix line endings. A BOM here once
    made the miner fall through to its built-in default dataset and report
    results for a file nobody asked about; the miner now refuses to guess, and
    this writer does not give it a reason to.
    """
    lines = [
        f"dataset_path={dataset.miner_csv.as_posix()}",
        f"output_path={report_path.as_posix()}",
        f"json_output_path={json_path.as_posix()}",
        f"neighbor_distance={params.eps_m}",
        f"min_prevalence={params.min_prev}",
        f"percentage_instances={params.sample_pct}",
        "debug_mode=false",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8", newline="\n")


class JobRunner:
    """Runs one mining job at a time and serves finished results from disk."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        # Held for the whole of submit(). Two requests arriving together would
        # otherwise each cancel the current job and then each start one, leaving
        # the first of the two new processes untracked — an orphan that mines
        # for minutes with nothing able to stop it.
        self._submit_lock = threading.Lock()
        self._jobs: dict[str, MiningJob] = {}
        self._current: MiningJob | None = None
        self._process: subprocess.Popen | None = None
        self._thread: threading.Thread | None = None
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        JOBS_DIR.mkdir(parents=True, exist_ok=True)

    # -- queries -----------------------------------------------------------

    def job(self, job_id: str) -> MiningJob | None:
        with self._lock:
            return self._jobs.get(job_id)

    def result(self, job_id: str) -> dict | None:
        """Load a finished job's miner output from the cache."""
        job = self.job(job_id)
        if job is None or job.status != STATUS_DONE:
            return None
        path = cache_path(job.result_key)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def cached(self, params: JobParams, dataset: PreparedDataset) -> str | None:
        key = cache_key(params, dataset)
        return key if cache_path(key).exists() else None

    # -- lifecycle ---------------------------------------------------------

    def submit(self, params: JobParams, dataset: PreparedDataset) -> MiningJob:
        """Start a job, or return one already finished for these parameters."""
        with self._submit_lock:
            return self._submit(params, dataset)

    def _submit(self, params: JobParams, dataset: PreparedDataset) -> MiningJob:
        key = cache_key(params, dataset)
        job = MiningJob(id=uuid.uuid4().hex[:12], params=params, result_key=key)

        if cache_path(key).exists():
            job.status = STATUS_DONE
            job.stage = "done"
            job.from_cache = True
            job.finished_at = time.time()
            with self._lock:
                self._jobs[job.id] = job
            return job

        binary = miner_binary()
        if not binary.exists():
            job.status = STATUS_FAILED
            job.error = (
                f"miner binary not found at {binary}. Build it with: "
                "g++ -O2 -std=c++17 backend/engine/src/*.cpp -Ibackend/engine/include "
                "-o backend/engine/bin/colocation_miner"
            )
            job.finished_at = time.time()
            with self._lock:
                self._jobs[job.id] = job
            return job

        self.cancel_current()

        with self._lock:
            self._jobs[job.id] = job
            self._current = job
            job.status = STATUS_RUNNING
            self._thread = threading.Thread(
                target=self._run, args=(job, dataset, binary), daemon=True
            )
            self._thread.start()
        return job

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return False
            if job.status not in (STATUS_QUEUED, STATUS_RUNNING):
                return False
            is_current = self._current is not None and self._current.id == job_id
        if is_current:
            self.cancel_current()
            return True
        with self._lock:
            job.status = STATUS_CANCELLED
            job.finished_at = time.time()
        return True

    def cancel_current(self) -> None:
        """Stop the running child and wait for it to actually be gone."""
        with self._lock:
            process = self._process
            job = self._current
            thread = self._thread

        if process is not None and process.poll() is None:
            if job is not None:
                job.status = STATUS_CANCELLED
            terminate_tree(process)

        if thread is not None and thread.is_alive():
            thread.join(timeout=10)

        with self._lock:
            if job is not None and job.status in (STATUS_QUEUED, STATUS_RUNNING):
                job.status = STATUS_CANCELLED
                job.finished_at = time.time()
            self._process = None
            self._current = None
            self._thread = None

    def shutdown(self) -> None:
        self.cancel_current()

    def clear_cache(self) -> int:
        """Delete every cached result. Returns how many were removed."""
        removed = 0
        for path in CACHE_DIR.glob("*.json"):
            path.unlink()
            removed += 1
        return removed

    # -- worker ------------------------------------------------------------

    def _run(self, job: MiningJob, dataset: PreparedDataset, binary: Path) -> None:
        workspace = JOBS_DIR / job.id
        workspace.mkdir(parents=True, exist_ok=True)
        config_path = workspace / "config.txt"
        report_path = workspace / "report.txt"
        json_path = workspace / "result.json"

        try:
            write_miner_config(config_path, job.params, dataset, report_path, json_path)

            process = _spawn_isolated([str(binary), str(config_path)], str(workspace))
            with self._lock:
                self._process = process

            for line in process.stdout:
                line = line.strip()
                if line.startswith("[stage]"):
                    with self._lock:
                        job.stage = line.split("]", 1)[1].strip()

            stderr = process.stderr.read()
            code = process.wait()

            with self._lock:
                cancelled = job.status == STATUS_CANCELLED

            if cancelled:
                shutil.rmtree(workspace, ignore_errors=True)
                return

            if code != 0:
                self._fail(job, stderr.strip() or f"miner exited with code {code}")
                return

            if not json_path.exists():
                self._fail(job, "miner produced no JSON result")
                return

            payload = json.loads(json_path.read_text(encoding="utf-8"))

            # The miner echoes the dataset it actually read. A mismatch means the
            # config never reached it intact, and the numbers describe some other
            # file — a failure, not a result.
            reported = Path(payload.get("dataset_path", "")).resolve()
            expected = dataset.miner_csv.resolve()
            if reported != expected:
                self._fail(
                    job,
                    f"miner read {reported} but the job asked for {expected}",
                )
                return

            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            shutil.move(str(json_path), str(cache_path(job.result_key)))
            shutil.rmtree(workspace, ignore_errors=True)

            with self._lock:
                job.status = STATUS_DONE
                job.stage = "done"
                job.finished_at = time.time()

        except Exception as error:  # noqa: BLE001 - surfaced to the caller as job state
            self._fail(job, f"{type(error).__name__}: {error}")
            shutil.rmtree(workspace, ignore_errors=True)
        finally:
            with self._lock:
                if self._current is not None and self._current.id == job.id:
                    self._process = None
                    self._current = None

    def _fail(self, job: MiningJob, message: str) -> None:
        with self._lock:
            if job.status != STATUS_CANCELLED:
                job.status = STATUS_FAILED
                job.error = message
                job.finished_at = time.time()
