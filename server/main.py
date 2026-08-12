"""FastAPI backend for the co-location mining explorer.

Serves the JSON API and, in production, the built React app (``dist/``) from the
same origin, so the whole app runs as a single process on a single port.

Dev (two terminals, or ``npm run dev:all``):
    python -m uvicorn server.main:app --reload --port 8000   # from spatial_web/
    npm run dev                                               # Vite proxies /api

Production (single process):
    npm run build
    python -m uvicorn server.main:app --host 0.0.0.0 --port 8000
    # open http://localhost:8000

The miner binary must be built first; see server/engine/PROVENANCE.md.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .datasets import DatasetRegistry
from .mining_job import JobParams, JobRunner, STATUS_DONE, miner_binary
from .pattern_query import (
    PatternIndex,
    SpatialGrid,
    describe_pattern,
    participation_counts,
    query_instance,
)
from .rare_labeling import DEFAULT_MIN_COUNT, DEFAULT_PERCENTILE, label_rare
from .upload import UploadError, parse_upload, store_upload

ROOT = Path(__file__).resolve().parents[1]  # spatial_web/
DIST_DIR = ROOT / "dist"

@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    # Never leave a miner process behind when the server goes away.
    RUNNER.shutdown()


app = FastAPI(title="Co-location Mining Explorer API", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

REGISTRY = DatasetRegistry()
RUNNER = JobRunner()

# Derived views of a finished result, keyed by cache key. Building the
# participation sets costs a pass over every instance list, so it is done once
# per result and not per request.
_INDEX_CACHE: dict[str, PatternIndex] = {}
_GRID_CACHE: dict[tuple[str, float], SpatialGrid] = {}


class JobRequest(BaseModel):
    dataset_id: str
    eps_m: float = Field(gt=0, le=100000)
    min_prev: float = Field(ge=0, le=1)
    sample_pct: float = Field(default=1.0, gt=0, le=1)


def _dataset(dataset_id: str):
    try:
        return REGISTRY.get(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown dataset {dataset_id!r}")
    except (OSError, ValueError) as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


def _result_of(job_id: str) -> tuple[dict, object]:
    job = RUNNER.job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="unknown job")
    if job.status != STATUS_DONE:
        raise HTTPException(
            status_code=409, detail=f"job is {job.status}, no result available"
        )
    result = RUNNER.result(job_id)
    if result is None:
        raise HTTPException(status_code=410, detail="result no longer in cache")
    return result, job


def _index_for(job) -> PatternIndex:
    if job.result_key not in _INDEX_CACHE:
        result = RUNNER.result(job.id)
        _INDEX_CACHE[job.result_key] = PatternIndex.build(result or {})
    return _INDEX_CACHE[job.result_key]


def _grid_for(dataset, eps_m: float) -> SpatialGrid:
    key = (dataset.info.id, eps_m)
    if key not in _GRID_CACHE:
        _GRID_CACHE[key] = SpatialGrid(dataset.instances, eps_m)
    return _GRID_CACHE[key]


@app.get("/api/health")
def health() -> dict:
    binary = miner_binary()
    return {
        "status": "ok",
        "miner_binary": str(binary),
        "miner_available": binary.exists(),
    }


@app.get("/api/datasets")
def datasets() -> dict:
    summaries = REGISTRY.summaries()
    return {"count": len(summaries), "datasets": summaries}


@app.get("/api/datasets/{dataset_id}/instances")
def dataset_instances(dataset_id: str) -> dict:
    dataset = _dataset(dataset_id)
    return {
        "dataset_id": dataset_id,
        "has_latlon": dataset.has_latlon,
        "count": len(dataset.instances),
        "feature_counts": dataset.feature_counts,
        "instances": dataset.instances,
    }


@app.post("/api/jobs")
def create_job(request: JobRequest) -> dict:
    dataset = _dataset(request.dataset_id)
    params = JobParams(
        dataset_id=request.dataset_id,
        eps_m=request.eps_m,
        min_prev=request.min_prev,
        sample_pct=request.sample_pct,
    )
    job = RUNNER.submit(params, dataset)
    return job.as_dict()


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str) -> dict:
    job = RUNNER.job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="unknown job")
    return job.as_dict()


@app.delete("/api/jobs/{job_id}")
def cancel_job(job_id: str) -> dict:
    if not RUNNER.cancel(job_id):
        job = RUNNER.job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="unknown job")
        raise HTTPException(status_code=409, detail=f"job is {job.status}")
    return RUNNER.job(job_id).as_dict()


@app.get("/api/jobs/{job_id}/result")
def job_result(
    job_id: str,
    rare_percentile: float = Query(DEFAULT_PERCENTILE, ge=0, le=100),
    rare_min_count: int = Query(DEFAULT_MIN_COUNT, ge=0),
) -> dict:
    """A finished result with rare labels applied at request time.

    Rarity is recomputed from the feature counts the miner reported, so moving
    the threshold costs one request and never re-runs the miner.
    """
    result, job = _result_of(job_id)
    feature_counts = result.get("feature_counts", {})
    rare, threshold = label_rare(feature_counts, rare_percentile, rare_min_count)

    patterns = [
        {
            **describe_pattern(pattern, rare, participation_counts(pattern)),
            "pattern_index": i,
        }
        for i, pattern in enumerate(result.get("patterns", []))
    ]

    return {
        "job_id": job_id,
        "params": job.params.as_dict(),
        "kappa": result.get("kappa"),
        "total_instances": result.get("total_instances"),
        "timings_s": result.get("timings_s", {}),
        "peak_memory_mb": result.get("peak_memory_mb"),
        "feature_counts": feature_counts,
        "rare_features": sorted(rare),
        "rare_threshold": threshold,
        "rare_percentile": rare_percentile,
        "rare_min_count": rare_min_count,
        "pattern_count": len(patterns),
        "patterns": patterns,
    }


@app.get("/api/jobs/{job_id}/instances/{feature}/{number}")
def instance_patterns(
    job_id: str,
    feature: str,
    number: int,
    rare_percentile: float = Query(DEFAULT_PERCENTILE, ge=0, le=100),
    rare_min_count: int = Query(DEFAULT_MIN_COUNT, ge=0),
) -> dict:
    """Patterns this instance takes part in, with co-participating neighbours."""
    result, job = _result_of(job_id)
    dataset = _dataset(job.params.dataset_id)
    rare, _ = label_rare(result.get("feature_counts", {}), rare_percentile, rare_min_count)

    try:
        return query_instance(
            dataset=dataset,
            index=_index_for(job),
            grid=_grid_for(dataset, job.params.eps_m),
            feature=feature,
            number=number,
            eps_m=job.params.eps_m,
            rare=rare,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown instance {feature}{number}")


@app.post("/api/uploads")
async def upload_dataset(
    file: UploadFile = File(...),
    feature_column: str = Form(...),
    label: str = Form(""),
    x_column: str | None = Form(None),
    y_column: str | None = Form(None),
    latitude_column: str | None = Form(None),
    longitude_column: str | None = Form(None),
    id_column: str | None = Form(None),
) -> dict:
    """Register a user's CSV as a temporary dataset it can then be mined like any other."""
    raw = await file.read()
    try:
        rows = parse_upload(
            raw,
            feature_column=feature_column,
            x_column=x_column or None,
            y_column=y_column or None,
            latitude_column=latitude_column or None,
            longitude_column=longitude_column or None,
            id_column=id_column or None,
        )
        info = store_upload(rows, label or file.filename or "Uploaded dataset")
    except UploadError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    REGISTRY.register(info)
    try:
        return REGISTRY.get(info.id).summary()
    except (OSError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/cache")
def clear_cache() -> dict:
    """Drop every cached mining result. The next run mines again."""
    removed = RUNNER.clear_cache()
    _INDEX_CACHE.clear()
    return {"removed": removed}


# Serve the built SPA from the same origin in production. Mounted last so /api/*
# routes above always take precedence. In dev this directory does not exist and
# Vite serves the frontend with a /api proxy instead.
if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="spa")
