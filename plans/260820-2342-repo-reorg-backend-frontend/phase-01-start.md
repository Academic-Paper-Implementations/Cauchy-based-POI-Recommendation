---
phase: 1
title: "Move the trees & rename the Python package"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Move the trees & rename the Python package

## Overview

Physically relocate the frontend and backend trees with `git mv` (history
preserved) and rename the Python package `server` → `backend`, fixing every
absolute `from server.` import. After this phase the files are in place but
configs/Docker/docs still point at old paths — that is Phase 2. Nothing is
expected to run yet.

## Requirements
- Functional: all frontend assets + Node config under `frontend/`; the whole
  Python/engine tree under `backend/`; zero `from server.` / `import server`
  references remain anywhere under `backend/`.
- Non-functional: moves use `git mv` so `git status` shows renames, not
  delete+add; no file content changes except the import-line rename.

## Architecture
Two `git mv` groups + a scoped find-replace of the package name. The engine C++
tree moves as a subdirectory of `backend/` untouched. Relative imports
(`from .mining_job`) are unaffected — only the ~12 absolute `server.` references
change.

## Related Code Files
- Move (frontend): `src/`, `public/`, `index.html`, `explorer.html`,
  `package.json`, `package-lock.json`, `vite.config.js`, `postcss.config.js`,
  `eslint.config.js`, `vercel.json` → `frontend/`
- Move (backend): `server/` → `backend/`
- Modify (imports, `server.` → `backend.`):
  `backend/extract/build_cuisine_dataset.py`,
  `backend/tests/conftest.py`, `backend/tests/test_api.py`,
  `backend/tests/test_datasets.py`, `backend/tests/test_mining_job.py`,
  `backend/tests/test_pattern_query.py`, `backend/tests/test_rare_labeling.py`,
  `backend/tests/test_recommendation.py`, `backend/tests/test_upload.py`
  (plus any other match the grep below surfaces)

## Implementation Steps
1. Create dirs and move the frontend tree:
   `mkdir frontend && git mv src public index.html explorer.html package.json package-lock.json vite.config.js postcss.config.js eslint.config.js vercel.json frontend/`
2. Move the backend tree (package rename): `git mv server backend`
3. Rewrite absolute imports. Find every one first:
   `grep -rnE "from server\b|import server\b|from server\." backend/` — then
   replace `from server.` → `from backend.`, `from server import` →
   `from backend import`, `import server` → `import backend` in each hit.
   Re-run the grep; it must return **zero**.
4. Confirm relative imports (`from .`) are untouched and the engine tree moved
   intact: `ls backend/engine/src backend/engine/include`.
5. Sanity: `git status` shows the moves as renames (R); no unexpected deletes.

## Success Criteria
- [x] `frontend/` holds `src public index.html explorer.html` + all Node config;
      root no longer has them.
- [x] `backend/` holds `main.py engine/ data/ tests/ extract/ requirements*.txt`;
      root no longer has `server/`.
- [x] `grep -rnE "from server\b|import server\b|from server\." backend/` returns
      nothing.
- [x] `git status` shows renames, not delete+add, for moved files.

## Risk Assessment
- **A `from server.` slips through** (e.g. inside a string or a less-common
  import form). *Signal:* the closing grep is non-empty, or Phase 3 pytest hits
  `ModuleNotFoundError: server`. *Response:* widen the grep to `\bserver\b`
  under `backend/*.py` and inspect each; fix before leaving this phase.
- **`git mv` refuses on Windows** for an open/locked file. *Signal:* mv error.
  *Response:* close editors/watchers holding the file, retry; do not fall back to
  copy+delete (loses history).
