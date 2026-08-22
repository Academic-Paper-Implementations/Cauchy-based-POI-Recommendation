# Backend Lifecycle Review — job/concurrency/subprocess/cache

Scope: `backend/mining_job.py`, `backend/main.py` (xref `datasets.py`, `upload.py`).
Read-only. Each listed edge case classified HANDLED / PARTIAL / UNHANDLED with evidence.
CONFIRMED = provable from code. PLAUSIBLE = depends on runtime/miner behavior not in these files.

## Confirmed bugs by severity
- HIGH x1: DELETE-cancel vs POST-submit teardown race orphans a new miner (the exact failure `_submit_lock` claims to prevent).
- MEDIUM x2: stdout/stderr PIPE deadlock can hang the worker; unbounded module caches + `_jobs` leak memory on a long-lived / upload-heavy server.
- LOW x2: `_index_for` TOCTOU can poison `_INDEX_CACHE` with an empty index; `job.status` written outside `_lock` in `cancel_current`.
- PLAUSIBLE/latent: stale grid/presence/bits after re-register with an existing id (not reachable today — upload ids are fresh uuids).

---

## 1. Concurrency `_run` vs `cancel_current` — PARTIAL

- Deadlock: NONE. `_lock` is `RLock` (213). `thread.join` (320) and `terminate_tree` (317) run OUTSIDE the lock, so the worker can still take `_lock` to update `job.stage` (360). Correct.
- Torn process handle: NOT possible. `_run` keeps a LOCAL `process` var (353) and only publishes it to `self._process`; after cancel nulls `self._process`, the worker still reads its local handle. No torn read.
- New-job clobber by a slow old thread: guarded. `_run.finally` (409) nulls `_process/_current` only `if self._current.id == job.id`. Good.
- DEFECT (LOW): `job.status = STATUS_CANCELLED` at line 316 is written OUTSIDE `_lock`, while the worker reads `job.status` under `_lock` (367, 415). Benign under CPython GIL, but it is an unsynchronized write on a field otherwise guarded by the lock. Inconsistent discipline.
- Latency note: `cancel_current` can block the calling request-thread up to ~20s (terminate_tree 5+5s at 90/104, then join up to 10s at 320). Not a deadlock; ties up a threadpool worker.

## 2. Orphan process — UNHANDLED (HIGH, CONFIRMED)

`submit()` holds `_submit_lock` across `cancel_current()`+thread-start (250-289), so two concurrent POSTs cannot orphan. BUT `cancel()` / `cancel_current()` do **not** take `_submit_lock` (291, 307). A concurrent `DELETE /api/jobs/{current}` and `POST /api/jobs` race:

1. DELETE→`cancel_current` captures old `process`/`thread` under lock (309-312), releases.
2. It terminates old + joins old thread outside the lock (314-320).
3. Concurrently POST grabs `_submit_lock`, runs its own `cancel_current` (old already dead → no-ops), then installs job B: `_current=B`, `_thread=Bt`, starts `Bt`; `Bt._run` sets `self._process=Bproc` (354).
4. DELETE now runs its FINAL block (322-328): **unconditionally** `self._process=None; self._current=None; self._thread=None` — clobbering B's tracking. Unlike `_run.finally`, this teardown has NO `_current.id == job.id` guard.

Result: B's miner process is untracked (orphan mining for minutes); `_current=None`. A later `DELETE /api/jobs/B` finds B RUNNING but `is_current=False` (298) → sets B CANCELLED without killing anything (302-304) → orphan is now unstoppable — precisely the scenario the module docstring (215-217) says `_submit_lock` exists to prevent. FastAPI sync endpoints run in a threadpool, so the two handlers do run on separate threads → reachable.

Reproduction: mine job A; from UI/two tabs fire `DELETE /api/jobs/A` and `POST /api/jobs` within the same ~tens of ms window (a "re-run with new params" that cancels then submits). Observe a C++ miner process with no owning `_current`.
Fix direction (not applied): take `_submit_lock` inside `cancel()`; and/or guard the teardown block so it only nulls `self._process/_current/_thread` when they still refer to the captured `job`/`process`/`thread`.

terminate_tree escalation review: on POSIX SIGTERM→(5s)→SIGKILL→(5s) is correct. On Windows the first attempt is already `taskkill /T /F` (hard, tree); the escalation `process.kill()` (99) only terminates the direct child, NOT grandchildren — if `taskkill` fails/times out, a grandchild can survive. Edge, low.

## 3. cache_key collision / stale serve — HANDLED (acceptable)

Key = `{params(dataset_id,eps,min_prev,sample_pct), input_size, input_mtime_ns}` sha1 (135-150).
- Cross-dataset collision: impossible — `dataset_id` is in the key.
- CHANGED file, same size+mtime_ns → stale patterns: effectively impossible. Any content change goes through `prepare()` rewriting `miner.csv`, which stamps a fresh current-time mtime; matching a previously-cached file's `st_mtime_ns` to 100ns NTFS granularity across separate runs is not realistically achievable. UNACCEPTABLE case not reachable.
- Needless re-mine on identical re-prepare: avoided — `prepare()` skips rewrite when the source fingerprint matches (260-270), so mtime is stable → cache hit.

## 4. Result lifecycle / None-deref — PARTIAL

- `_result_of` (95-106): None→410. All public result endpoints (`job_result`, `instance_patterns`, `instance_recommendations`, `site_recommendations`) call it FIRST, so `result.get(...)` downstream is on a non-None dict. Safe.
- `_grid_for`/`_bits_for`/`_presence_for`: independent of the result dict. Safe.
- DEFECT (LOW, PLAUSIBLE): `_index_for` (109-113) re-fetches `RUNNER.result(job.id)` (a SECOND disk read; DRY nit vs the `result` already in hand) and, if the cache file was deleted between `_result_of` and `_index_for` (TOCTOU, e.g. concurrent `DELETE /api/cache`), builds `PatternIndex.build({})` and CACHES that empty index under `result_key`. Because `_INDEX_CACHE` is only cleared by `clear_cache`, and the clearing happened just before this poisoning write, a subsequent re-mine at the same key serves a permanently-empty pattern index. Narrow window; no crash (`result or {}` guards the deref), but silent-empty results.

## 5. Unbounded caches — UNHANDLED (MEDIUM, CONFIRMED) + stale-after-reupload (PLAUSIBLE)

Module dicts `_INDEX_CACHE`, `_GRID_CACHE`, `_PRESENCE_CACHE`, `_BITS_CACHE`, `_AREA_CACHE` (69-76) are never evicted. Also `JobRunner._jobs` (219) and `DatasetRegistry._prepared`/`_infos` grow without bound. Every distinct `(dataset_id, eps)`, `result_key`, `(result_key, feature, top)` adds entries forever.

Real-world trigger: a hosted deployment (Vercel/long-lived uvicorn) where users repeatedly upload CSVs. Each upload mints a NEW `upload-<uuid>` id (`store_upload` line 188) → new grid/presence/bits/index/instances that are NEVER freed even after that upload is abandoned, plus a disk file per upload and a permanent `_jobs` entry per submit. Monotonic memory growth → eventual OOM. CONFIRMED unbounded growth. `clear_cache` (355-363) only clears `_INDEX_CACHE`+`_AREA_CACHE`; it cannot bound the others, and does not touch `_jobs`.

Stale-after-reupload (item 5b): `DatasetRegistry.register` (392-395) pops `_prepared` but NOT `_GRID/_PRESENCE/_BITS` keyed by `(dataset.info.id, eps)`. The comment at main.py 359-361 assumes those caches "describe the dataset" and stay valid — TRUE only while a dataset id maps to fixed content. If `register` is ever called with an EXISTING id whose grid/presence/bits are populated, those become stale (keyed by id, built from the OLD instances). NOT reachable today: upload ids are fresh uuids (188) and builtin datasets are never re-registered. Classify PLAUSIBLE/latent — a correctness landmine if an "overwrite this dataset id" feature is added later. Flagged explicitly per request.

## 6. `_run` failure / partial paths — HANDLED, with one subprocess hazard

- Cancelled mid-stream: rmtree + return, nothing cached (369-371). Invariant holds.
- `except`: `_fail` (only marks FAILED if not CANCELLED, 415) + rmtree (404-406). `finally` nulls current-guarded (407-411). Good.
- code!=0 → `_fail(stderr)`; missing JSON → `_fail` (373-378). Good.
- dataset-path mismatch guard (386-393): resolves reported vs expected; a miner that omits `dataset_path` yields `Path("").resolve()` = CWD ≠ expected → always FAILED. Correct defense but tightly couples to the miner echoing `dataset_path`.
- Very narrow: an exception between `shutil.move` (396) and `status=DONE` (400) would leave the result IN the cache but job FAILED; a later submit with the same key returns DONE from_cache with a valid file. Inconsistent status only; result valid. Acceptable.
- NEW HAZARD (MEDIUM, PLAUSIBLE) — PIPE deadlock: `_run` drains `process.stdout` fully in the loop (357-361), then reads `process.stderr` afterwards (363). With both pipes buffered (`bufsize=1`), if the C++ miner writes more than the OS stderr pipe buffer (~64KB) before finishing stdout, the miner blocks on the stderr write, never closes stdout, and the stdout loop blocks forever → worker hangs (and `cancel_current`'s 10s join then times out, feeding into the item-2 teardown race). Classic single-threaded two-pipe drain bug. Real for a long, stderr-chatty miner. Fix direction: drain both pipes concurrently (thread/`communicate`) or redirect stderr to a file.

## 7. cancel() of a non-current job — HANDLED (consistent; one dead state)

Design runs one job at a time; only `_current` is ever set RUNNING (284). `submit` transitions QUEUED→RUNNING/DONE/FAILED synchronously inside `_submit`, so a persisted QUEUED job never exists and a non-current RUNNING job is unreachable under normal flow. `cancel` for a non-current job (302-304) setting CANCELLED without touching a process is therefore only ever exercised for already-finished-or-current ids → the branch is effectively defensive/dead for QUEUED. Logic consistent. (The item-2 race is the one way `_current` and a live RUNNING job desynchronize — see there.)

## 8. JobRequest validation — HANDLED

`eps_m gt0 le100000`, `min_prev ge0 le1`, `sample_pct gt0 le1` (79-83). inf rejected (`inf<=100000` False); nan rejected (all comparisons False). `min_prev=0` is permitted and valid (miner returns all patterns — large but not a gap). `dataset_id` unvalidated but `_dataset` 404s unknown ids. No gap vs the miner config writer (187-206), which passes the same floats through. Fine.

---

## Recommended actions (ranked)
1. HIGH — Close the DELETE-cancel vs POST-submit orphan race: acquire `_submit_lock` in `cancel()`, and make `cancel_current`'s final teardown guard `self._process/_current/_thread` against the captured job/process/thread (mirror `_run.finally`).
2. MEDIUM — Drain miner stdout+stderr concurrently (or stderr→file) to remove the PIPE-deadlock hang.
3. MEDIUM — Bound the module caches and `_jobs` (LRU/size cap or eviction on dataset drop); at minimum evict `_GRID/_PRESENCE/_BITS/_prepared/_jobs` for abandoned uploads to stop the leak on hosted deployments.
4. LOW — In `_index_for`, reuse the `result` already fetched by `_result_of` and skip caching when it is falsy, to avoid empty-index poisoning; move `job.status` write in `cancel_current` (316) under `_lock`.
5. Note for the future: if an "overwrite dataset id" path is ever added, `register` must also evict `_GRID/_PRESENCE/_BITS/_AREA/_INDEX` for that id (item 5b).

## Unresolved questions
- Does the compiled miner write substantial output to stderr during a long run? Confirms/denies item-6 PIPE deadlock severity.
- Does the miner always emit `dataset_path` in its JSON? The mismatch guard (386) fails the job otherwise.
