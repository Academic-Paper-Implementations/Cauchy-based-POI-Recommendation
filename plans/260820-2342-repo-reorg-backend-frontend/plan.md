---
title: "Repo Reorg: backend/ + frontend/"
description: "Split the mixed repo root into a clean backend/ (renamed Python package, ex-server/) and frontend/ (all Node/Vite tooling incl package.json). Pure move + path rewire; the app must run identically — dev:all, build, docker, pytest(76), vitest(82). WS2 of 3 (engine → reorg → thesis)."
status: pending
priority: P1
effort: "1d"
tags: [reorg, structure, backend, frontend, docker, vercel, aip490]
created: 2026-08-20
---

# Repo Reorg: backend/ + frontend/

## Overview

The repo root currently mixes frontend and backend. Frontend lives in `src/`,
`index.html`, `explorer.html`, `public/` plus all Node tooling at root
(`package.json`, `vite.config.js`, `postcss.config.js`, `eslint.config.js`,
`vercel.json`). Backend is the Python package `server/` (FastAPI `main.py`,
`engine/` C++ miner, `data/`, `tests/`, `extract/`, requirements).

This plan performs a **clean split** (decided in brainstorm 2026-08-20):

- **`frontend/`** ← `src/`, `index.html`, `explorer.html`, `public/`, and **all
  Node config incl `package.json`/lockfile** → a self-contained frontend project.
- **`backend/`** ← `server/` **renamed** (Python package `server` → `backend`;
  uvicorn `server.main:app` → `backend.main:app`; 12 files carry absolute
  `from server.` imports that must become `from backend.`).
- Neutral at root: `Dockerfile`, `.dockerignore`, `.env.example`, `README.md`,
  `docs/`, `plans/`, `Final_Thesis_G13_Short_Version/`.

It is a **pure move + path rewire**: no behavior, feature, API, or engine change.
WS2 of 3 (engine → reorg → thesis). See roadmap memory `thesis-submission-roadmap`.

## Contract

- **Outcome** — Two clean top-level projects, `backend/` and `frontend/`. Every
  workflow runs identically: `npm run dev:all` (vite + FastAPI), `npm run build`
  (→ `frontend/dist`), `docker build`/`run` (one-port SPA+API), `pytest`
  (76 pass), `vitest` (82 pass). No behavior, API, or engine change.
- **Constraints** — KISS/DRY. Moves via `git mv` (preserve history). The ONLY
  logic edits are path strings and the `server`→`backend` package rename. Do not
  touch engine source (WS1 just shipped), miner logic, component logic, or test
  assertions. Datasets/runtime stay inside `backend/`.
- **Non-goals** — feature work, code refactor, npm workspaces (rejected in
  brainstorm as overkill), engine changes, WS3 thesis, the dependabot alert
  (tracked separately in roadmap housekeeping).
- **Acceptance** — after the reorg: `pytest backend/tests` = 76 pass;
  `vitest` = 82 pass; `npm run dev:all` starts both processes and the frontend
  reaches the API via `/api`; `npm run build` emits `frontend/dist`;
  `docker build` succeeds and the container serves the SPA + `/api/health` on
  8000; both HTML entries (`index.html` **and** `explorer.html`) are built.

## Decisions locked (brainstorm 2026-08-20)

- **Clean split, node config INTO `frontend/`** (not root, not npm workspaces).
  Boundary is the priority; accept the cross-dir `dev:all` cost.
- **Rename Python package `server` → `backend`** (uvicorn module path + 12
  import files + test path all change). Chosen over keeping `server/` to match
  the roadmap's `backend/` target and keep naming consistent.
- **`dev:all` runs from `frontend/`**; the `api` script uses uvicorn
  `--app-dir ..` so the root-level `backend` package resolves regardless of CWD.
  Backend's own paths are `__file__`-based, so CWD does not matter to it.
- **One dist convention everywhere: `frontend/dist`.** Vite outputs there
  (default `dist` next to its config), FastAPI `DIST_DIR` points there, and
  Docker copies the built SPA to `./frontend/dist` so local and container agree.
- **Fix a pre-existing gap while here:** Dockerfile Stage 1 currently copies only
  `index.html`, never `explorer.html`, so the Explorer app is absent from the
  image. Add `explorer.html` to the Docker web stage.
- **Vercel Root Directory = `frontend`** is a dashboard setting (out-of-repo);
  `vercel.json` moves to `frontend/vercel.json`. Flagged as a manual user step.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Move the trees & rename the Python package](./phase-01-start.md) | Pending |
| 2 | [Rewire configs, Docker, Vercel, docs](./phase-02-rewire-configs-docker-vercel-docs.md) | Pending |
| 3 | [End-to-end validation](./phase-03-end-to-end-validation.md) | Pending |

## Architecture touchpoints

| Area | Files / change |
|------|----------------|
| Frontend tree | `git mv src public index.html explorer.html frontend/` |
| Node config | `git mv package.json package-lock.json vite.config.js postcss.config.js eslint.config.js vercel.json frontend/` |
| Backend tree | `git mv server backend` (package rename) |
| Python imports | 12 files: `from server.` → `from backend.` (11 under `backend/tests/`, 1 `backend/extract/build_cuisine_dataset.py`) |
| Uvicorn app path | `package.json` scripts + Dockerfile CMD + README: `server.main:app` → `backend.main:app` |
| dev:all / api script | `frontend/package.json`: `api` uses `python -m uvicorn backend.main:app --reload --port 8000 --app-dir ..` |
| DIST_DIR | `backend/main.py:48-49`: `DIST_DIR = ROOT / "frontend" / "dist"` |
| Vite | `frontend/vite.config.js`: drop `exclude:['server/**']` from test config (no longer a sibling) |
| Dockerfile | web stage COPY from `frontend/` (+`explorer.html`); engine stage COPY `backend/engine/...`; runtime COPY `backend`, `--from=web /app/dist ./frontend/dist`, `MINING_RUNTIME_DIR=/app/backend/runtime`, VOLUME `/app/backend/runtime`, CMD `backend.main:app` |
| Ignore files | `.gitignore` + `.dockerignore`: `server/engine/bin`, `server/engine/out`, `server/runtime` → `backend/...` |
| Miner hint text | `backend/mining_job.py:271-272`: g++ command string `server/engine/...` → `backend/engine/...` |
| Docs | `README.md`: path/command sections (`server/`→`backend/`, build/run, dir tree) |

## Success Criteria (roll-up)

- [ ] `backend/` and `frontend/` exist; root no longer holds `src/`, `server/`,
      or any Node config; history preserved via `git mv`.
- [ ] `pytest backend/tests` → 76 passed; `vitest` → 82 passed.
- [ ] `npm run dev:all` (from `frontend/`) starts vite + uvicorn; `/api` proxy
      reaches the backend; both HTML entries load.
- [ ] `npm run build` emits `frontend/dist` with `index.html` **and**
      `explorer.html`.
- [ ] `docker build .` succeeds; `docker run -p 8000:8000` serves the SPA and
      `GET /api/health` returns miner status.
- [ ] No engine/miner/component logic or test assertion changed — diff is moves,
      path strings, and the package rename only.

## Risk Assessment

- **`dev:all` cross-dir breakage** — uvicorn can't find `backend` package when
  run from `frontend/`. *Signal:* `ModuleNotFoundError: backend` on `npm run
  api`. *Response:* the `--app-dir ..` flag adds repo root to `sys.path`;
  verified in Phase 3. Fallback: `cd .. &&` prefix in the script.
- **DIST_DIR mismatch local vs Docker** — SPA 404s because FastAPI looks in the
  wrong dir. *Signal:* `/` returns 404 or blank in one environment. *Response:*
  single convention `frontend/dist` enforced in both `main.py` and the Docker
  COPY target; asserted in Phase 3.
- **Missed absolute import** — a stray `from server.` survives the rename.
  *Signal:* `ModuleNotFoundError: server` in pytest or at runtime. *Response:*
  grep `\bserver\.` and `from server` across `backend/` after the rename; must
  return zero before Phase 3 sign-off.
- **Vercel Root Directory not updated** — Vercel keeps building from repo root
  and finds no `package.json`. *Signal:* Vercel build fails "no package.json".
  *Response:* out-of-repo dashboard setting — documented as a manual user step in
  Phase 2; not fixable from the repo.
- **Windows CRLF / `git mv` case** — noisy but harmless. *Response:* rely on
  `git mv`; verify `git status` shows renames (R), not delete+add, where paths
  are unchanged in case.

## Open Questions

None — layout, node-config placement, package rename, and dist convention were
all resolved in the brainstorm.

<!-- slug: repo-reorg-backend-frontend -->
