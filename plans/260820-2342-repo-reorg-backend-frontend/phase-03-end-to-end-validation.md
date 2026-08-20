---
phase: 3
title: "End-to-end validation"
status: pending
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: End-to-end validation

## Overview

Prove the reorg runs identically to before: backend tests, frontend tests, the
`dev:all` dev loop, a production build, and a Docker build+run. Fix any path
regression surfaced here, then hand off to commit.

## Requirements
- Functional: pytest 76 pass, vitest 82 pass, dev:all serves both, build emits
  `frontend/dist` with both entries, Docker container serves SPA + `/api/health`.
- Non-functional: the change set is moves + path strings + the package rename
  only — no test assertion or logic edit to make things pass.

## Architecture
Validation only. Backend tests run from repo root as the `backend` package
(`python -m pytest backend/tests`). Frontend tests + build run in `frontend/`.
Docker is the integration check that the multi-stage path rewrite is coherent.

## Related Code Files
- No product code changes expected. Any edit here is a path-regression fix
  traced to Phase 1/2, recorded in the report.

## Implementation Steps
1. Backend: from repo root (venv active), `python -m pytest backend/tests` →
   expect **76 passed**. (Use PowerShell per roadmap note: MSYS2 binaries fail
   under the Bash tool.)
2. Zero stray refs: `grep -rn "server\." backend/*.py` and
   `grep -rnE "\bserver/" Dockerfile .gitignore .dockerignore README.md
   frontend/` → only intentional prose, ideally nothing.
3. Frontend tests: in `frontend/`, `npm ci` (fresh, lockfile moved) then
   `npm test` → expect **82 passed**; `npm run lint` clean.
4. Dev loop: `npm run dev:all` from `frontend/` — confirm vite serves and
   uvicorn starts as `backend.main:app` with no `ModuleNotFoundError`; hit the
   app and confirm a `/api/...` call reaches the backend through the proxy.
5. Build: `npm run build` → `frontend/dist/` contains `index.html` **and**
   `explorer.html` plus assets.
6. Docker: `docker build -t colocation-app .` then
   `docker run -p 8000:8000 colocation-app`; `curl localhost:8000/api/health`
   returns miner status and `GET /` serves the SPA.
7. Update roadmap memory `thesis-submission-roadmap`: WS2 = DONE; NEXT = WS3.

## Success Criteria
- [ ] `python -m pytest backend/tests` → 76 passed.
- [ ] `npm test` (in `frontend/`) → 82 passed; `npm run lint` clean.
- [ ] `npm run dev:all` runs both processes; `/api` proxy reaches the backend.
- [ ] `npm run build` emits `frontend/dist` with both HTML entries.
- [ ] `docker build` succeeds; container serves SPA + `/api/health` on 8000.
- [ ] Final diff = moves + path strings + package rename only (no assertion/logic
      edits).

## Risk Assessment
- **A test imports via an old path and fails** — *Signal:* pytest collection
  error `ModuleNotFoundError: server`. *Response:* trace to the missed import
  from Phase 1; fix the import, not the test.
- **Docker health check fails on miner binary path** — *Signal:*
  `/api/health` reports `miner_available:false`. *Response:* confirm Stage-3
  COPY lands the binary at `backend/engine/bin/colocation_miner` and
  `mining_job.miner_binary()` resolves it; adjust the COPY dest, not the Python.
- **CI/Vercel not exercised locally** — Vercel Root Directory is a dashboard
  setting no local check can prove. *Response:* documented as a manual user step;
  out of scope for local validation.
