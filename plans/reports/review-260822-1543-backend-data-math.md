# Backend data-ingestion + math edge-case review (260822-1543)

Read-only. Files: upload.py, datasets.py, recommendation.py, pattern_query.py,
rare_labeling.py, main.py (invocation + upload endpoint + CORS). No code changed.

## Confirmed bug count
- 1 Medium-High correctness (co-located point exclusion)
- 2 Medium (unbounded upload disk growth + no auth; single out-of-range row aborts whole file)
- 2 Low / PARTIAL (unknown-feature bit=0 masks divergence; event-loop block on parse)
- Rest HANDLED.

---

## 1. Upload limits off-by-one — HANDLED (consistent)
- MAX_FEATURES=64. upload.py:145-146 `seen_features.add` then `if len(seen_features) > 64: raise`. 65th distinct feature rejected; exactly 64 accepted.
- FeatureBits (recommendation.py:64-68) raises at `len(names) > 64`; `1<<i` with i in enumerate(sorted) → i max 63 at 64 features. Upload ceiling and bitmask ceiling agree exactly. No off-by-one.
- MAX_INSTANCES=50_000. upload.py:167 `if len(rows) > 50000: raise` AFTER append → 50001st row appended into memory then whole upload aborts (HTTPException 400). Cap effectively 50000. The one-over row is discarded with the abort; no state persists. Acceptable.
- Ordering asymmetry (feature check before append L146, instance check after append L167) is cosmetic: both raise and abort, so no partial state is committed either way.

## 2. Upload validation asymmetry — PARTIAL (low, design choice, one real sharp edge)
Four distinct behaviours in the row loop:
- lat/lon unparseable → `continue` skip row (upload.py:133-134)
- lat/lon parseable but out of range → **raises, aborts entire upload** (upload.py:135-138)
- x/y unparseable → `continue` skip row (upload.py:142-143)
- x/y out of range → no check (projected metres have no natural bound) — accepted

Sharp edge (CONFIRMED, low severity): a **single** typo'd coordinate (e.g. lat=91 in one row of a 10k-row file) aborts the whole upload, while a single non-numeric coordinate silently drops just that row. Defensible as a mapping-sanity check (out-of-range strongly implies the user mapped the wrong column), but the all-or-nothing reaction to one dirty row is harsh and inconsistent with the skip-on-unparseable path. Not a security issue.

Empty-degrees trace: `project_local` (upload.py:44-49) raises on empty, but that path is unreachable — when `not has_xy`, a row is appended iff its lat/lon parsed (L133 continue guards), and `degrees` is appended in lockstep (L164). So `rows` non-empty ⟺ `degrees` non-empty, and the `if not rows: raise` at L173 fires first. project_local's guard is dead defensive code, not a bug. HANDLED.

## 3. Trust boundary (CSV injection / XSS / auth) — mostly NON-ISSUE, but real DoS/leak
Threat model: uploads land in RUNTIME/uploads/upload-*.csv (store_upload:189-198) and are re-read only programmatically (miner CSV + _read_source → JSON). The app never opens them in a spreadsheet. Registry is in-memory per-process; no cross-user sharing, no download-as-CSV endpoint. The uploader is the sole consumer of their own file.
- **CSV formula injection** (`=CMD()` as a feature/id value written verbatim, store_upload:197): NON-ISSUE in this app — the file is never delivered to Excel/Sheets, and the only "victim" is the uploader. Revisit only if uploads ever become downloadable or shared between users.
- **XSS**: feature/name/id/attributes are attacker-controlled and flow to the frontend as JSON. React escapes by default; risk only if a frontend consumer uses dangerouslySetInnerHTML (out of scope for these files — flag for frontend review). Given single-user in-memory model, low.
- **CONFIRMED real issues** (trust-boundary, in scope):
  - **No authentication** on `POST /api/uploads` (main.py:321) combined with **CORS `allow_origins=["*"]`** (main.py:59-61). Any origin can drive uploads/mining through a victim's browser or directly.
  - **Unbounded disk growth**: every upload writes upload-{uuid}.csv AND a prepared cache dir under PREPARED_DIR/upload-{uuid}/ (datasets.prepare:253-291). Nothing ever deletes them. The in-memory registry entry is lost on restart, but the on-disk files persist forever. `DELETE /api/cache` (main.py:355-363) clears only result caches, not upload files. Repeated uploads (each up to 20 MB raw + normalized CSV + instances.json) accumulate without bound → disk exhaustion. Severity Medium (thesis/demo single-process app, but a genuine unbounded-resource failure mode).

## 4. FeatureBits unknown-feature → 0 — PARTIAL (low)
- i max 63 at exactly 64 features; `1<<63` fits Python's unbounded int. Confirmed.
- `bit()`/`mask()` return 0 for an unknown feature (recommendation.py:70-77). Dataset bits are built from `dataset.feature_counts` (main.py:127) and patterns come from a result mined over the same dataset, so pattern features ⊆ dataset features in the normal path.
- Masking concern (PLAUSIBLE, low): if a cached result and the dataset ever diverge (e.g. dataset re-prepared with different features while an old result is still cached), an unknown pattern member contributes bit 0. In recommend_for_point, `needed = pattern_mask & ~bits.bit(candidate)` (recommendation.py:227) then `needed & present_mask == needed` (L228): a missing member's requirement silently vanishes, so a pattern can be judged "ready" without that feature actually present — a silent wrong-positive rather than an error. Only reachable under result/dataset divergence; not a normal-path bug.

## 5. Percentile math — HANDLED (two methods, intentional)
- rare_labeling.percentile (L18-31): linear interpolation, numpy default. Empty→0.0; single→ordered[0]; percent clamped to [0,100] (L26). Correct.
- recommendation._percentile (L277-283): nearest-rank; docstring states interpolation is pointless for the small score lists here — intentional divergence, not an inconsistency bug. Empty→0.0. rank = clamp(ceil(p/100*n)-1, 0, n-1): p=0→0 (min), p=100→n-1 (max), negative→0, >100→n-1. Fully clamped. HANDLED.
- rare_threshold `max(percentile, min_count)` (rare_labeling.py:42-45): floors the rare cutoff at min_count (default 30) so a genuinely small feature is never called common because the count-percentile landed below it. label_rare uses `count <= threshold` (L57). Semantics match docstring. HANDLED.

## 6. recommend_for_point — HANDLED
- origin missing → KeyError (recommendation.py:193) → caught at main.py:293-294 → 404. Confirmed.
- `present[feature] += 1` hand-adds the selected point since grid.within excludes it (recommendation.py:197) — but see finding #8: it excludes by distance==0, not by identity, which interacts here.
- Empty patterns → candidates empty → ranked empty. `round(score,6)` safe. No division. HANDLED.

## 7. recommend_areas — HANDLED
- No supporting patterns → early empty return (recommendation.py:339-340). No scored cells → empty with pattern_count (L344-345).
- `_score_cells` memoises on mask (deterministic). Threshold via `_percentile` then `score >= threshold` selection (L347-348) — inclusive, so ties all select; fine.
- `_regions_from` (L286-304): flood fill removes `start` via `remaining.pop()` and every neighbour via `remaining.discard` **before** pushing (L300-301), so no cell is ever pushed twice → no infinite loop, no missed cell. 8-way (dx,dy ∈ {-1,0,1}); the (0,0)/self case is harmless since self is already out of `remaining`. Correct.
- centroid sum/len safe: each group has ≥1 cell (start). HANDLED.
- frame None (coords-only datasets, e.g. Toronto) → bbox/centroid omit lat/lon keys (L366 guard). Documented "no map background" contract. HANDLED.

## 8. SpatialGrid.within excludes co-located distinct instances — CONFIRMED BUG (Medium-High)
pattern_query.py:43 `if distance <= radius and distance > 0.0`. The `> 0.0` is meant to exclude the query point itself (docstring L35), but it excludes by **distance, not identity**. Two DISTINCT instances at identical (x,y) both have distance 0.0 and are wrongly dropped.
- Real in this data: multiple businesses at one plaza/address, or projection/rounding collisions, share exact metre coordinates. Cuisine datasets (many POIs per block) are the most exposed.
- Impact:
  - query_instance (pattern_query.py:110): co-located same-pattern neighbours are missing → the map under-reports actual co-locations.
  - recommend_for_point (recommendation.py:195-199): co-located features never enter `present` → present_mask lacks them → patterns requiring that feature judged not-ready → recommendation scores silently understated.
- CellPresence (recommendation.py:96-114) bins by cell, not distance, so recommend_areas is unaffected — only the point-level grid queries are wrong.
- Repro: instances A1 and B1 both at x=100,y=200. `grid.within(100,200,eps)` from A1 → B1 distance 0.0 → excluded; B not counted nearby though it is co-located.
- Fix direction (not applied): exclude by identity (skip when `inst is origin` / matching feature+number), not by `distance > 0.0`.

## 9. datasets.prepare cache — HANDLED (one accepted limitation)
- fingerprint = size + mtime_ns + path + schema (datasets.py:236-243); compared whole (`cached.get("source") == fingerprint`, L263). Schema bump (_RECORD_SCHEMA_VERSION=2, L233) is inside the fingerprint → older cache over byte-identical source is invalidated. HANDLED.
- Unreadable/corrupt cache → `except (ValueError, KeyError, OSError): pass` → rebuild (L271-272). HANDLED.
- _read_source raises ValueError on missing required cols (L318) and on no usable rows (L361). Missing feature or unparseable x/y → row skipped (L323-330). HANDLED.
- Accepted limitation: if a source is modified with size AND mtime_ns preserved (e.g. restore-with-timestamps), the stale cache is served. Standard mtime-cache tradeoff; note only.

---

## Cross-cutting (not in the 9 items, worth flagging)
- **Event-loop block**: `upload_dataset` is `async` and awaits `file.read()`, then runs the synchronous CPU-bound `parse_upload` on up to 20 MB inline (main.py:333-343), blocking the event loop for the duration. Low-Medium; move to a threadpool or make the endpoint sync.
- **Per-request O(n) index rebuild**: `dataset.index()` rebuilds the full `(feature,number)->record` dict on every point query (recommendation.py:191, pattern_query.py:105). Not N+1-DB, but a full pass per click; memoise on the dataset if instance lists are large. Low.
- **Unlocked shared caches**: _INDEX_CACHE/_GRID_CACHE/_PRESENCE_CACHE/_BITS_CACHE/_AREA_CACHE and REGISTRY dicts use check-then-set under FastAPI's threadpool. GIL keeps dict ops atomic so no corruption, but concurrent first-hits can double-build (idempotent, wasteful). Low.

## Unresolved questions
- Is there any intended cleanup/TTL for uploaded datasets and their prepared caches, or is disk growth expected to be bounded operationally (single-user thesis demo)? Determines whether finding #3 disk-leak is Medium or informational.
- Is `POST /api/uploads` meant to be reachable without auth in the deployed thesis app, or is deployment single-user localhost only? Determines severity of the CORS-`*` + no-auth combination.
