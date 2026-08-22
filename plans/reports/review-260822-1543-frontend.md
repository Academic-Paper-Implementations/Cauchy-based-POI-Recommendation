# Frontend edge-case verification — explorer app

Scope: use-mining-job.js, mining-request.js, crs.js, api.js, explorer-app.jsx + explorer/components, leaflet-map.jsx, error-boundary.jsx, data-upload.jsx, job-progress.jsx.
Tests: `npm test` (vitest run) — **82 passed / 14 files**, incl. 7 in use-mining-job.test.js. Read-only, no code changed.

## Verdict per edge case

### 1. Poll effect deps `[job, rarePercentile, loadResult]` — PARTIAL (cadence OK; stale-write real)
- Cadence: HANDLED in practice. Each poll `setJob(next)` tears down + recreates the interval, so it behaves as a re-armed setTimeout chain, not a fixed setInterval. Cumulative drift = one server round-trip per tick, never a double-fire in normal (<1s) latency. Test `polls a running job until it is done` passes advancing 1000ms twice, confirming steady progression. No fix needed.
- Slow-server overlap: PLAUSIBLE (low). If `api.job` > POLL_MS the interval can fire again before `setJob` triggers teardown → two in-flight polls. Self-correcting, only under >1s latency.
- Unmount / post-teardown write: UNHANDLED (low). The poll callback has **no guard**. On unmount, an in-flight `await api.job` still runs `setJob`/`setPollError` and, on `done`, `loadResult`→`setResult`/`setAppliedPercentile`. React 18 no longer warns, so harmless here, but it is the same unguarded path that becomes issue #3.

### 2. RACE — poll `loadResult` vs debounced rare relabel — UNHANDLED (CONFIRMED, medium)
- `loadResult` (L48-55) writes `setResult`/`setAppliedPercentile` with **no token/abort guard**. `changeRarePercentile` (L113-136) is token+abort guarded, but the two do not share a guard.
- Repro: job flips to `done`; the completing poll calls `loadResult(job, P1)` (closure percentile) and awaits. User immediately drags slider to P2 while `jobRef.current.status==='done'` → debounced token-guarded request for P2 fires (200ms + net). If the P1 `loadResult` response lands **after** the P2 response, `loadResult`'s `setResult(P1)` overwrites the newer P2 result and sets `appliedPercentile=P1`. Result shows stale rare labels until the next slider move.
- Not covered by tests: `ignores a superseded response` exercises only two debounced requests, never loadResult-vs-debounce.
- Fix direction: route `loadResult` through the same `rareTokenRef` (bump+check) so a late poll load cannot clobber a newer relabel.

### 3. run/cancel/reset leakage — UNHANDLED (CONFIRMED, low-medium)
- `reset()` bumps `rareTokenRef` (guards only the rare debounce) and clears the interval by nulling `job`. It does **not** guard the poll's `loadResult`/`setJob`.
- Repro: dataset switch → `handleSelectCity` awaits `cancel()` then `reset()`. A poll that was already in-flight before reset resolves afterward and runs `setJob(next)` (reviving an abandoned job) and, if `next.status==='done'`, `loadResult` writes a result belonging to the discarded dataset into the freshly-reset view. Narrow window (one round-trip after reset), but a real cross-dataset leak.
- No interval leak: teardown via `clearInterval` on job-change/unmount is correct; `run` never starts a second interval (single effect keyed on `job`).
- Fix direction: a generation/epoch ref checked inside the poll callback before any `setJob`/`loadResult`, bumped by `reset` and `run`.

### 4. mining-request clamp / rangeError — HANDLED
- Boundaries pass exactly: eps 20→20, 300→300; minPrev 0.05→0.05, 1→1 (none equal 0). NaN/Infinity/`''`→fallback; negative→clamped to min. Covered by mining-request.test.js.
- Minor inconsistency (cosmetic, guarded): a literal `0` clamps to DEFAULT (100), while `rangeError(0)` shows "Min 20". Harmless because `hasValidationError` disables Run, so 0 never reaches `miningRequest`. `Number('')===0`→fallback is intentional and correct.

### 5. crs.js axis order + LatLonFrame-null contract — HANDLED (explorer) / PARTIAL (contract gap, not reachable here)
- Axis order correct: `xy`→[y,x] and bbox [[y_min,x_min],[y_max,x_max]]; CRS.Simple lat=y. Pinned by crs.test.js.
- Cross-layer gap is REAL but UNREACHABLE in explorer-app: if `crs==='latlon'` and bbox lacks `lat_min/lon_min`, `toBounds`→`[[undefined,undefined],…]`→`L.rectangle`/`L.latLngBounds` gets undefined → Leaflet NaN/throw. **crs.js guards nothing** — it trusts the caller to pass a bbox matching the CRS. However explorer-app hardcodes `crs="latlon"` and passes **no `regions`** prop, so `toBounds` is never invoked there. The gap only bites a region-rendering caller pairing latlon CRS with an xy-only bbox. Classify PLAUSIBLE for that other surface; no owner currently guards the mismatch.

### 6. api.request / query — HANDLED (one PLAUSIBLE-low)
- Non-ok with HTML body: `res.json()` throws inside `try`, caught, falls back to `statusText` → `throw new Error("500: Internal Server Error")`. No throw escapes the catch. HANDLED.
- AbortError surfaces with `error.name==='AbortError'`; every consumer (`changeRarePercentile`, `handlePoiClick`) checks it. HANDLED.
- `query()` filters only `undefined`/`null`, not `NaN`/`''`. A NaN percentile would serialize as `rare_percentile=NaN`. Not reachable today (percentiles come from range input via `Number`, always finite; default 25). PLAUSIBLE-low; backend should reject.

### 7. Null / missing-coord rendering — PARTIAL (one CONFIRMED crash path, caught by boundary)
- Result null / empty patterns: guarded. `tier1`/`tier2` use `detail?.patterns`, `if (!result …)`. NearbyList only mounts when `selected && detail`.
- CONFIRMED unguarded deref: explorer-app L236 `noPatternsAtAll={detail.patterns.length === 0}` is **not** optional-chained. If the `instancePatterns` response ever lacks `patterns`, this throws during render → ErrorBoundary catches (blank-page prevented) but the panel dies. Low severity given backend contract, but inconsistent with the `detail?.patterns` guards two lines up.
- Missing lat/lon: `leaflet-map` `toLatLng(crs, instance)` returns `[undefined,undefined]` for a projected-only record under `crs='latlon'` → `L.circleMarker` throws → ErrorBoundary. Map assumes lat/lon present; fine for cuisine datasets (lat/lon by definition), fragile for arbitrary uploads. PLAUSIBLE.
- ErrorBoundary itself: solid — class boundary, short user message, full stack to console, no PII/stack leaked to UI beyond `error.message`.

### 8. XSS — MOSTLY HANDLED, one CONFIRMED sink
- JSX rendering of dataset labels, names, features, attributes relies on React default escaping. **No** `dangerouslySetInnerHTML`, no `href={…}`/`src={…}` taking attacker data. HANDLED.
- CONFIRMED sink — Leaflet tooltip (leaflet-map.jsx L95): `marker.bindTooltip(\`${instance.feature} · ${instance.id}\`)`. Leaflet 1.x `DivOverlay._updateContent` assigns a **string content via `innerHTML`**, bypassing React escaping. `instance.feature` and `instance.id` are attacker-controlled (mapped from uploaded CSV `feature_column`/`id_column`). A crafted value (e.g. `<img src=x onerror=…>`) executes on marker hover = stored DOM-XSS.
  - Exploitability PLAUSIBLE (medium): requires a malicious dataset to be uploaded/served and a user to hover the marker. The region tooltip (L200) interpolates only numbers → safe.
  - Fix direction: pass tooltip content as a DOM node / `L.Util` text, or sanitize, rather than an interpolated HTML string.

### 9. Test run — decisive
- 82/82 pass. use-mining-job state-machine claims (poll-to-done, cache short-circuit, failure-threshold warning, debounce single-request, superseded-response guard) are all covered and green. Note the covered superseded-response test does **not** exercise the poll-`loadResult`-vs-debounce race (#2) nor the reset race (#3).

## Confirmed bugs, ranked
1. **[Medium] Rare-label race: poll `loadResult` can overwrite a newer debounced relabel** — use-mining-job.js L48-55 & L66 vs L113-136. Stale rare labeling; self-heals on next drag. Not test-covered.
2. **[Medium] Stored DOM-XSS via Leaflet marker tooltip** — leaflet-map.jsx L95; attacker-controlled `feature`/`id` reach Leaflet `innerHTML`. Requires malicious upload + hover.
3. **[Low-Medium] reset/dataset-switch race: in-flight poll writes abandoned job's result** — use-mining-job.js poll callback L60-72 unguarded vs reset L140-147. Cross-dataset leak, one-round-trip window.
4. **[Low] Unguarded `detail.patterns.length`** — explorer-app.jsx L236 can throw on a malformed response (ErrorBoundary catches).
5. **[Low] `query()` does not drop NaN/empty** — api.js L25-29; not reachable today, backend should reject.

## Non-issues (verified)
- Poll cadence stability (test-proven); clamp boundaries (test-proven); crs axis order (test-proven); api error parsing on HTML 500 body; AbortError propagation; React escaping for all JSX text sinks; ErrorBoundary has no data leak.

## Unresolved questions
- Does any non-explorer surface pass `regions` with `crs='latlon'` and an xy-only bbox? That is the only path that makes the crs.js contract gap (#5) live.
- Backend guarantee that `/result` responses always include `patterns` and every cuisine instance has lat/lon? Confirms whether #4 and the missing-coord path are dead code or reachable.
