---
phase: 2
title: "Rewire configs, Docker, Vercel, docs"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Rewire configs, Docker, Vercel, docs

## Overview

Update every path/module reference so the moved trees run again: npm scripts,
uvicorn app path + `--app-dir`, FastAPI `DIST_DIR`, Vite test excludes, the
Dockerfile (multi-stage COPY paths + the `explorer.html` gap + runtime dir),
`.gitignore`/`.dockerignore`, the miner g++ hint string, and README paths.

## Requirements
- Functional: after this phase `dev:all`, `build`, `docker build`, `pytest`,
  `vitest` all reference correct paths (verified in Phase 3).
- Non-functional: single dist convention `frontend/dist` used by Vite output,
  FastAPI, and Docker alike. No logic change beyond paths.

## Architecture
The `dev:all` orchestrator now lives in `frontend/package.json`. Vite runs in
`frontend/` and outputs `frontend/dist` (its default `dist` beside the config).
The `api` script launches uvicorn with `--app-dir ..` so the root-level
`backend` package imports even though CWD is `frontend/`. FastAPI resolves the
SPA via `ROOT/frontend/dist` where `ROOT = backend/`'s parent = repo root.

## Related Code Files
- Modify: `frontend/package.json` — `api` and `start` scripts:
  `server.main:app` → `backend.main:app`; `api` adds `--app-dir ..`.
- Modify: `backend/main.py:48-49` — `DIST_DIR = ROOT / "frontend" / "dist"`.
- Modify: `frontend/vite.config.js` — drop `'server/**'` from `test.exclude`
  (add `'../backend/**'` only if needed; simplest is to just remove it).
- Modify: `Dockerfile` — see steps 5–8.
- Modify: `backend/mining_job.py:271-272` — g++ hint string
  `server/engine/...` → `backend/engine/...`.
- Modify: `.gitignore` — `server/engine/bin/`, `server/engine/out/`,
  `server/runtime/` → `backend/...`.
- Modify: `.dockerignore` — `server/runtime`, `server/engine/bin`,
  `server/engine/out` → `backend/...`.
- Modify: `README.md` — path/command sections + dir tree.
- (Manual, out-of-repo) Vercel dashboard: Root Directory → `frontend`.

## Implementation Steps
1. `frontend/package.json`: set
   `"api": "python -m uvicorn backend.main:app --reload --port 8000 --app-dir .."`
   and `"start": "python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --app-dir .."`.
   `dev`, `build`, `dev:all`, `lint`, `test` need no path change (they run in
   `frontend/`).
2. `backend/main.py`: change `DIST_DIR = ROOT / "dist"` to
   `DIST_DIR = ROOT / "frontend" / "dist"` (ROOT already = `parents[1]` = repo
   root, which is correct after the move). Update the module docstring's `dist/`
   mention to `frontend/dist/`.
3. `frontend/vite.config.js`: remove `'server/**'` from `test.exclude`.
4. `backend/mining_job.py`: update the g++ hint string paths to
   `backend/engine/...`.
5. Dockerfile — web stage (Stage 1): COPY from `frontend/`:
   `COPY frontend/package.json frontend/package-lock.json ./` then
   `COPY frontend/index.html frontend/explorer.html frontend/vite.config.js frontend/postcss.config.js ./`
   and `COPY frontend/src ./src`, `COPY frontend/public ./public`.
   **Add `explorer.html`** (was missing — Explorer app was absent from the image).
6. Dockerfile — engine stage (Stage 2): COPY `backend/engine/src`,
   `backend/engine/include`.
7. Dockerfile — runtime stage (Stage 3): COPY `backend/requirements.txt`;
   `COPY backend ./backend`; `COPY --from=web /app/dist ./frontend/dist`;
   `COPY --from=engine /engine/colocation_miner ./backend/engine/bin/colocation_miner`;
   `ENV MINING_RUNTIME_DIR=/app/backend/runtime`; `VOLUME ["/app/backend/runtime"]`;
   `CMD ["python","-m","uvicorn","backend.main:app","--host","0.0.0.0","--port","8000"]`.
   (No `--app-dir` needed in Docker: WORKDIR `/app` already holds `backend/`.)
8. `.gitignore` + `.dockerignore`: rewrite the three `server/...` ignore lines to
   `backend/...`.
9. `README.md`: update build/run commands (`server/engine/...`, `server.main:app`
   → `backend...`; the `mkdir -p ... bin`, g++, uvicorn lines), the pytest path
   (`server/tests` → `backend/tests`), the volume path
   (`/app/server/runtime` → `/app/backend/runtime`), and the directory-tree
   section (`server/` → `backend/`, add `frontend/`). Note the Vercel Root
   Directory dashboard step for deployers.

## Success Criteria
- [x] `frontend/package.json` `api`/`start` use `backend.main:app` (+`--app-dir ..`
      for `api`/`start` local).
- [x] `backend/main.py` `DIST_DIR` → `frontend/dist`.
- [x] Dockerfile builds both HTML entries and copies dist to `./frontend/dist`;
      runtime dir + CMD updated.
- [x] No `server/` path string remains in `Dockerfile`, `.gitignore`,
      `.dockerignore`, `frontend/**` config, or `README.md`
      (grep `server/` across them returns only intentional prose, ideally zero).
- [x] README documents the Vercel Root Directory = `frontend` manual step.

## Risk Assessment
- **uvicorn `--app-dir ..` interaction with `--reload`** — reload watcher may
  base on the wrong dir. *Signal:* edits don't reload, or import fails on
  reload. *Response:* verified live in Phase 3; fallback is a `cd .. &&` prefix.
- **Docker WORKDIR vs COPY dest** — copying `backend` into `/app/backend` must
  keep `backend.main` importable with CWD `/app`. *Signal:* container CMD hits
  `ModuleNotFoundError: backend`. *Response:* ensure COPY dest is `./backend`
  (not `./`); Phase 3 runs the container and hits `/api/health`.
- **README drift** — a missed command in docs. *Response:* low blast radius
  (docs only); grep `server/` in README and reconcile.
