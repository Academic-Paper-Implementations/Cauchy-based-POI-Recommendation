# Codebase Parallel Audit — Aggregated Report

Date: 2026-08-22 · Branch: master · Mode: `/ak-code-review codebase[parallel]`
Four parallel `code-reviewer` agents, clear file ownership, verify-not-discover.

Per-area detail:
- Engine C++ → `review-260822-1543-engine-cpp.md`
- Backend lifecycle → `review-260822-1543-backend-lifecycle.md`
- Backend data/math → `review-260822-1543-backend-data-math.md`
- Frontend → `review-260822-1543-frontend.md`

Verification: frontend `npm test` 82/82 pass; engine differential harness (new hybrid vs legacy BK oracle) 0 mismatches over 2,130,944 exhaustive + 20,000 random graphs.

---

## Ranked findings

### HIGH
| # | Finding | Location | Verdict |
|---|---------|----------|---------|
| H1 | **Orphan miner via cancel/submit race.** `cancel()`/`cancel_current()` skip `_submit_lock`; a concurrent `DELETE /api/jobs/{current}` + `POST /api/jobs` lets DELETE's unguarded final teardown null `_process/_current/_thread` *after* POST installed job B → B's miner orphaned, `_current=None`, later DELETE can't kill it. Exactly the case `_submit_lock` was meant to prevent. Trigger: UI "re-run with new params" firing DELETE+POST within tens of ms. | `mining_job.py:291,307,322-328` | CONFIRMED |

### MEDIUM
| # | Finding | Location | Verdict |
|---|---------|----------|---------|
| M1 | **Co-located instances silently dropped from radius queries.** `within()` excludes by `distance > 0.0` (distance, not identity), so two distinct-feature instances at identical (x,y) are wrongly excluded → under-reports co-locations, understates point/area recommendations. | `pattern_query.py:43` | CONFIRMED |
| M2 | **Stored DOM-XSS via Leaflet tooltip.** `bindTooltip(\`${feature} · ${id}\`)` — Leaflet 1.x sets string tooltip via innerHTML, bypassing React escaping; `feature`/`id` come from uploaded CSV. Executes on hover. | `leaflet-map.jsx:95` | CONFIRMED |
| M3 | **Unbounded caches + `_jobs` + upload disk growth.** `_INDEX/_GRID/_PRESENCE/_BITS/_AREA_CACHE`, `JobRunner._jobs`, upload CSVs + prepared caches never evict. Each `upload-<uuid>` leaks memory + a disk file forever; `clear_cache` clears only 2 of 5. Monotonic growth on a long-lived deploy. | `main.py:69-76`, upload dir | CONFIRMED |
| M4 | **Rare-label race.** Poll's `loadResult` writes result with no token/abort guard, unlike debounced `changeRarePercentile`; on job-complete-during-drag a stale percentile result can overwrite a newer one. Self-heals on next drag; not covered by existing tests. | `use-mining-job.js:48-55` | CONFIRMED |
| M5 | **Subprocess PIPE-deadlock.** `_run` fully drains stdout then reads stderr single-threaded; if the miner writes >~64KB to stderr before stdout closes, it blocks → worker hangs (feeds H1's join timeout). | `mining_job.py:357-363` | PLAUSIBLE (depends on miner stderr volume) |
| M6 | **Auth-less `/api/uploads` under CORS `*`.** Unauthenticated arbitrary-CSV write to disk. Threat-model dependent (local thesis demo vs public Vercel). | `main.py:59-61,321` | CONFIRMED, context-gated |

### LOW
| # | Finding | Location |
|---|---------|----------|
| L1 | reset/dataset-switch race — poll callback has no generation guard; in-flight poll after a city switch revives abandoned job / writes old result into new view | `use-mining-job.js:60-72,140-147` |
| L2 | `_index_for` TOCTOU with `DELETE /api/cache` → caches an empty `PatternIndex.build({})` under result_key, permanently-empty index for that key | `main.py:109-113` |
| L3 | Non-reproducible sampling vs seedless cache key — `mt19937(random_device)` reseeds each run for `0<pct<1`; disk cache key omits seed | `data_loader.cpp:60` |
| L4 | No instance-id uniqueness validation — duplicate `(Feature,Instance)` silently corrupts adjacency via `ptrMap` collision | `neighbor_graph.cpp`, `data_loader.cpp` |
| L5 | Non-atomic report publish — remove-then-rename; failed rename loses prior report | `report_writer.cpp:37-38` |
| L6 | **Latent RCD maximality bug (output-masked, harmless).** CASE-1 X-check gated behind `if(!P.empty())` emits non-maximal R when P empty — but only ever R.size()==1, discarded by `report_clique` size<2 guard. Proven harmless by differential harness. One-line fix available, not urgent. | `maximal_clique_hashmap.cpp:207` |
| L7 | One bad lat/lon row aborts the whole upload, vs silent skip for a bad x/y row — inconsistent | `upload.py:133-143` |
| L8 | Unguarded `detail.patterns.length` deref (sibling line uses `detail?.patterns`); ErrorBoundary catches | `explorer-app.jsx:236` |
| L9 | `query()` filters only null/undefined, not NaN/'' (not reachable today) | `api.js:25-29` |
| L10 | `job.status = CANCELLED` written outside `_lock` while worker reads under lock (GIL-safe, inconsistent) | `mining_job.py:316` |

Non-issues assessed and dismissed: CSV formula injection (file never opened in a spreadsheet), FeatureBits `1<<63` ceiling (guarded), percentile method mismatch (intentional), poll cadence (test-proven stable), api error parsing / AbortError (sound), cache_key collision (infeasible).

---

## Open questions (set severity)
1. Does the C++ miner write heavy stderr? → confirms M5 severity.
2. Is `/api/uploads` intended auth-less in the deployed (Vercel) thesis app? → sets M6.
3. Upload disk/memory: is a TTL/cleanup intended, or is lifetime bounded operationally? → sets M3.
4. Does `/result` always include `patterns`, and do cuisine instances always carry lat/lon? → determines whether L8 and the projected-only-upload crash path are dead or reachable.
