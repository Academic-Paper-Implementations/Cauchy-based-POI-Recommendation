---
phase: 1
title: "Progress, cancel & per-city state"
status: done
priority: P1
effort: "2d"
dependencies: []
---

# Phase 1: Progress, cancel & per-city state

## Overview
Wire the already-built job lifecycle into the Explorer: a Cancel button, live
stage + server-computed elapsed time, inline input validation, and a per-city
`instances[]` cache so switching cities no longer discards work. Issues 4, 2, 3.

## Requirements
- Functional:
  - Cancel a running mine from the Explorer panel.
  - Show current stage (plain-language) + `job.elapsed_s` while running.
  - Inline validation on "Search distance (m)" and "How common (0–1)": flag
    out-of-range values instead of silently clamping at submit.
  - Switching city and back restores that city's loaded POIs without a refetch
    flash; re-running the mine with unchanged params is a server disk-cache hit.
- Non-functional: no new job-object cache (stale `job_id` trap); no i18n
  framework; existing tests stay green.

## Architecture
- **Cancel + progress:** `useMiningJob()` already exposes a tested `cancel()`
  (`src/hooks/use-mining-job.js:97-104`) and the poll loop keeps `job.stage` /
  `job.elapsed_s`. Thread `cancel` from `ExplorerApp` into `CityMiningPanel`.
  Port the progress pattern from `src/components/mining-controls.jsx:103-109`
  (disabled-unless-running Cancel) and `src/components/job-progress.jsx:53`
  (server `elapsed_s`, not a client `setInterval`). Reuse the Explorer's existing
  plain `STAGE_LABELS` (`city-mining-panel.jsx:6-13`) — do NOT copy the jargon
  labels from `job-progress.jsx:5-12`.
- **Validation:** `mining-request.js:16-21` already clamps on submit. Add inline
  field-level messages in `city-mining-panel.jsx` (inputs at lines 57-66 and
  72-81) using the same bounds constants already exported from
  `mining-request.js` (`EPS_MIN_M`/`EPS_MAX_M`, `MIN_PREV_MIN`/`MIN_PREV_MAX`).
  Do not change the clamp — it stays as the safety net; the message just removes
  the silent surprise. Disable Run while a field is invalid.
- **Per-city cache:** in `ExplorerApp`, keep a `useRef(new Map())` keyed by
  `dataset_id` holding that city's `instances[]` **only** (Validation decision 3
  — do NOT cache `selected`/`detail`/popup; user re-clicks to see around after a
  switch-back). In `handleSelectCity` (`explorer-app.jsx:61-77`), if the city is
  cached, restore from the map instead of refetching; otherwise fetch and
  populate. `epsM`/`minPrev` are already NOT reset on city switch
  (`explorer-app.jsx:20-21`), so "Search again" for a previously-mined city is a
  near-instant disk-cache hit via existing `run()`. Do NOT persist `job`/`job_id`
  client-side.
- **In-flight mine on city switch (Validation decision 2):** `handleSelectCity`
  currently only calls `reset()` (stops polling). It must ALSO call the hook's
  `cancel()` (server DELETE) so a mine for the old city does not keep running on
  the backend. Cancel first, then reset + load the new city.

<!-- Updated: Validation Session 1 - cache instances only; cancel in-flight job on city switch -->

## Related Code Files
- Modify: `src/explorer/explorer-app.jsx` (thread `cancel`; cancel in-flight job on city switch; per-city instances-only cache in `handleSelectCity`)
- Modify: `src/explorer/city-mining-panel.jsx` (Cancel button, elapsed, inline validation, disable-on-invalid)
- Modify: `src/explorer/mining-request.js` (only if a shared `isValid`/range helper is extracted for the panel to reuse — keep clamp intact)
- Reference (do not modify): `src/hooks/use-mining-job.js`, `src/components/mining-controls.jsx`, `src/components/job-progress.jsx`
- Tests: `src/explorer/city-mining-panel.test.jsx` (new/extend), `src/explorer/mining-request.test.js` (must still pass unmodified)

## Implementation Steps
1. Extract a small pure `rangeError(value, lo, hi)` helper (or reuse existing
   bounds) so the panel and `miningRequest` agree on validity; keep `clamp` as-is.
2. Add inline validation UI + messages to both inputs; disable Run when invalid.
3. Thread `cancel` from `useMiningJob` through `ExplorerApp` to `CityMiningPanel`;
   add a Cancel button shown only while `running`.
4. Add stage + `job.elapsed_s` display to the panel (plain labels).
5. Add per-city `instances[]` cache ref in `ExplorerApp`; restore on city switch,
   populate on first fetch. Leave job re-run to the disk cache.
6. Extend/adds vitest for: invalid input disables Run; cancel calls the hook;
   switching city A→B→A restores instances without a second fetch.

## Success Criteria
- [ ] Cancel button aborts a running mine (calls `cancel()`); hidden when idle.
- [ ] Panel shows current stage + server `elapsed_s` while running.
- [ ] Typing `>1` in "How common" or out-of-range distance shows an inline error and disables Run.
- [ ] City A→B→A shows B's and A's POIs with no refetch flash; re-mine of A is a disk-cache hit; no `selected`/popup carried across the switch.
- [ ] Switching city mid-mine cancels the in-flight job on the server (not just polling).
- [ ] `mining-request.test.js` passes unmodified; new panel tests green.

## Risk Assessment
- **Temptation to cache the job object for instant switch-back.** Signal it
  broke: 404 on `job_id` after a server restart mid-session. Response: cache only
  `instances[]`; rely on `run()` + disk cache for the mine. If zero-round-trip
  restore is later wanted, treat a 404 on a stale id as a cache miss and
  resubmit — never fail silently.
