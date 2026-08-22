# Brainstorm — Audit Fix Options (kongming-supervised)

Date: 2026-08-22 · Branch: master · Feeds: `/ak:fix`
Source: `review-260822-1543-*` (4-agent parallel audit) + kongming counsel.

## Contract
- **Outcome:** prioritized, approach-decided fix set the user selects from; ready to hand to `/ak:fix`.
- **Constraints:** KISS/DRY; thesis app; minimal localized changes; preserve differential-tested engine behavior; no arch rewrite.
- **Non-goals:** implement now; touch dismissed non-issues; redesign JobRunner.
- **Acceptance:** user picks scope → fix plan handed off.

## Deploy target — RESOLVED
Backend (FastAPI + C++ miner) runs in **Docker, long-running** (`Dockerfile` uvicorn + VOLUME runtime cache; mine takes minutes). Only **frontend** → Vercel static. NOT serverless → JobRunner design valid, all M3 fixes apply. (Closes kongming's biggest-risk question.)

## Fixes — decided approach

| ID | Sev | Problem | Chosen fix | Notes |
|----|-----|---------|-----------|-------|
| H1 | HIGH | Orphan miner: `cancel()` skips `_submit_lock`; teardown clobbers a freshly-submitted job → unkillable miner. `mining_job.py:291,307,322-328` | (a) full-body wrap `cancel()` in `_submit_lock` (mirror `submit()`); (b) keep identity-guard in `cancel_current` teardown (also protects `shutdown()`/lifespan which calls it directly) | Lock order `_submit_lock`→`_lock`, no cycle, no deadlock (kongming verified). Isolated + own concurrency test. Do (a) as FULL wrap incl. the is_current lookup, not partial. |
| M1 | MED | Co-located distinct instances dropped by `distance>0.0`. `pattern_query.py:43` | add `exclude=None` param, skip `if inst is exclude` | **Must update** `tests/test_pattern_query.py:153-164` (asserts old distance>0) in same commit. `recommendation.py:197` manual `+=1` stays correct. |
| M2 | MED | Stored DOM-XSS via `bindTooltip` innerHTML, feature/id from upload. `leaflet-map.jsx:95` | build DOM `<span>` with `textContent`, bind the node | Only ONE sink — `:200` region tooltip is numeric, safe. DOM node > escape helper (structurally safe). |
| M3a | MED (high-value) | **Workspace leak on failure** (kongming, new): 3 `_fail()` early returns skip `rmtree(workspace)`. `mining_job.py:373-393` | add `rmtree` to the 3 branches (or `finally`) | Cheapest fix, most exploitable disk-fill on public demo. |
| M3b | MED | 4 in-memory caches + `_jobs` never evict. `main.py:69-76` | small fixed-cap LRU (~50) per cache + cap `_jobs` | ~10 lines each; no generic framework (YAGNI). |
| M3c | MED | Uploaded CSVs + derived dataset caches never cleaned; upload uuid orphans grid/presence/bits. `upload.py:188`, `datasets.py:392` | TTL sweep: delete upload file + purge caches keyed by its dataset_id | The one disk-backed unbounded growth. |
| M4 | MED | Rare-label race: `loadResult` unguarded vs debounced path. `use-mining-job.js:48-55` | fold token bump+check **into `loadResult`** → covers poll + `run()` + post-`reset()` | Less code than bolt-on guard; removes the duplicate write path that caused the bug. |
| M5 | MED | stdout-then-stderr single-thread drain → PIPE deadlock if stderr>~64KB. `mining_job.py:357-363` | redirect miner stderr to temp file in workspace, read after `wait()` | KISS vs reader thread; `_fail` still reads file for its message. |
| M6 | LOW (↓) | Auth-less `/api/uploads` + CORS `*`. `main.py:59,321` | document demo status; OPTIONAL `DEMO_UPLOADS_ENABLED` env gate | CORS tightening is theater without auth; M3a/M3c disk fixes are the real public-demo mitigation. Rank last. |

Remaining LOW from the audit (L1–L10 in `review-260822-1543-codebase-parallel-summary.md`) not elevated here: L2 index-poisoning, L3 sampling non-reproducibility, L4 id-uniqueness, L5 non-atomic publish, L6 latent-harmless RCD, L7 upload-abort-on-one-bad-row, L8 unguarded deref, etc. Available as an optional "polish" batch.

## Sequencing (kongming)
1. **H1** alone (concurrency, own test) — don't batch with other `mining_job.py` edits.
2. **M5 + M3a** together (both touch `_run` error paths, same PR, review together) — after H1.
3. **M1** (`pattern_query.py`+`recommendation.py`+test) — no overlap with 1-2.
4. **M2 + M4** (independent frontend files) — parallel/same PR.
5. **M3b + M3c** (memory/disk hygiene) — own PR.
6. **M6** last — likely just the doc line.

Biggest single risk now: none architectural (deploy resolved). Remaining care item = H1 correctness → needs a real concurrent DELETE+POST test asserting no orphan `_process`/`_current`.

## Implementation status (2026-08-22)
User scope decision: fix **logic bugs only + keep architecture simple**; DROP all security (M2, M6) and production hardening (M3b/M3c); M3a/M5 offered, not applied.

DONE + verified:
- **H1** — `cancel()` now serializes on `_submit_lock` (`_cancel` split) + identity-guarded teardown in `cancel_current`. New regression `test_concurrent_cancel_and_submit_never_orphans_a_miner`. Backend 77 pass.
- **M1** — `SpatialGrid.within(exclude=origin)` identity skip; both callers + `test_pattern_query.py` brute-force test updated.
- **M4** — token guard folded into `loadResult` (single guarded write path); `changeRarePercentile` calls it. New regression `a completing poll does not clobber a newer relabel`. Frontend 83 pass.

Not done (per user): M2 XSS, M3a workspace-leak, M3b/c caches, M5 PIPE, M6 auth/CORS.

## Open questions
- Does the miner actually emit heavy stderr? Only affects how urgently M5 must ship (fix is cheap regardless).
- Want the optional LOW "polish" batch, or defer?
