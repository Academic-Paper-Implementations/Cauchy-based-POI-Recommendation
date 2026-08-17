---
title: "Explorer UX Rework"
description: "Close the gap between phase-04's approved Explorer design and what shipped, plus a Vietnamese locale pass. Covers 8 UX/behaviour issues (validation, per-city state, cancel+progress, free map interaction, flexible two-tier nearby list, subtle co-location signal, selection highlighting, Vietnamese). Data/city work (issue 5) deferred to its own plan."
status: done
priority: P1
effort: "1-1.5w"
tags: [explorer, frontend, ux, i18n, co-location]
created: 2026-08-18
---

# Explorer UX Rework

## Overview

The Co-located Spot Explorer (`src/explorer/`) shipped, but a review surfaced 8
UX/behaviour gaps — most of them **approved-but-unshipped pieces of
`plans/260816-1708-co-located-spot-explorer/phase-04-frontend-explorer-mode.md`**,
plus a full Vietnamese locale pass. This plan closes that gap. It does **not**
touch the C++ miner, the two-distance invariant (ε = mine-time co-location vs
discovery radius = view-only), the abandoned recommendation scope, or the
Investor/Mining view.

Brainstorm (2 rounds of kongming counsel):
`plans/reports/brainstorm-260816-1700-colocation-spot-explorer.md` (original app),
and this rework's decisions are recorded inline below.

## Contract

- **Outcome** — Explorer is Vietnamese, validates its inputs inline, keeps
  per-city state, is cancelable with live progress + elapsed time, lets the user
  pan/zoom freely, shows **both** co-located places and *other* nearby places
  (flexible radius up to ~1.5 km), and highlights a selection without hiding the
  other points.
- **Constraints** — ε defines co-location (mine-time) and never comes from the
  discovery radius; the radius is a view-only client-side filter. No re-import of
  recommendation scope. No i18n framework (single hardcoded VN locale, KISS).
  Investor/Mining view untouched. Existing 76 pytest + 48 vitest suites stay
  green; `no-prediction-copy.test.js` and the eps/radius guard in
  `mining-request.test.js` pass **unmodified** (proves the ε invariant untouched).
- **Non-goals** — Issue 5 data work: Vietnam (no Yelp coverage → new
  OSM/Overpass pipeline, licensing, attribute schema) AND additional US cities.
  Both deferred to a separate future plan. Widening the backend neighbour search
  past ε. Any "predict next POI" framing.
- **Acceptance** — see per-phase Success Criteria; roll-up in "Success Criteria"
  below.

## Decisions locked (brainstorm + 2 kongming rounds, 2026-08-18)

- **Tier split is the honest co-location signal.** Tier-1 = places in a mined
  co-located group (bounded by ε by definition); Tier-2 = other nearby places
  (client-side over all loaded instances, radius up to ~1.5 km). Whether a POI
  lands in tier-1 is driven entirely by mined pattern membership — that boundary
  IS the thesis proof, so the per-row relationship label can be subtle.
- **Co-location relationship shown subtly**, in `PoiPopup` only, only for a
  tier-1 POI: *"Thuộc nhóm đồng vị với Wine Bars + Tapas"* (or *"Thuộc N nhóm
  đồng vị"* when in more than one). **No line rendered for tier-2** — never claim
  "không đồng vị" (a POI outside ε of *this* origin may co-locate elsewhere;
  reuses the "thiếu ≠ Không" discipline in `attributes.js`).
- **Committee transparency = the existing Investor/Mining view (UC6)**, kept
  untouched. Explorer does not build a research toggle; tier boundary + one
  subtle popup line + the Investor view together carry it.
- **Tier-2 UX:** slider ceiling ~1.5 km (reuse phase-04's number, not a new one);
  default sort distance-ascending + a rating-descending toggle (no review-count
  sort — YAGNI); list cap ~15–20 rows with *"đang hiện N/M — mở rộng bán kính"*.
- **Distances client-side use projected x/y (Euclidean)**, matching the
  backend's `distance_m` in `pattern_query.py` — never haversine on lat/lon.
- **Issue 3 cache = `instances[]` per city only.** Do NOT cache job objects:
  `mining_job.py` mints a new `job_id` per submit, so a cached id 404s after a
  server restart. City switch-back re-runs `run()` and hits the server disk cache
  (eps/min_prev are not reset on city switch).
- **Issue 6 fix = make `setView` conditional, not remove it.** The zoom-in on
  first click solves a real sub-pixel-ε problem; keep it, only skip the forced
  recenter when the point is already on-screen and close enough.
- **Vietnamese pass is last** (Phase 4) so we translate final copy, including new
  strings introduced in Phase 3.

## Phases

| # | Phase | Issues | Status |
|---|-------|--------|--------|
| 1 | [Progress, cancel & per-city state](./phase-01-progress-and-state.md) | 4, 2, 3 | done |
| 2 | [Free map interaction](./phase-02-map-interaction.md) | 6 | done |
| 3 | [Two-tier nearby list & selection](./phase-03-nearby-tier-and-selection.md) | 7, 8, 9 | done |
| 4 | [Vietnamese localization](./phase-04-vietnamese-localization.md) | 1 | done |

Deferred (separate plan): **Issue 5** — Vietnam OSM/Overpass pipeline; optional
extra US Yelp cities via existing `server/extract/build_cuisine_dataset.py`.

## Architecture touchpoints

| Area | Files |
|------|-------|
| Explorer shell | `src/explorer/explorer-app.jsx` |
| Mining panel / inputs | `src/explorer/city-mining-panel.jsx`, `src/explorer/mining-request.js` |
| Radius control | `src/explorer/discovery-radius-control.jsx` |
| Nearby list | `src/explorer/cluster-group-list.jsx` (→ restructured) |
| Popup | `src/explorer/poi-popup.jsx` |
| Job lifecycle | `src/hooks/use-mining-job.js` (already has `cancel()`) |
| Map | `src/components/leaflet-map.jsx` |
| Progress pattern to port | `src/components/job-progress.jsx`, `src/components/mining-controls.jsx` |
| Copy guard | `src/explorer/no-prediction-copy.test.js` (auto-scans `src/explorer/`) |

## Success Criteria (roll-up)

- [ ] Clicking an isolated (non-co-located) POI shows tier-2 nearby places, not an empty panel.
- [ ] City A→B→A with unchanged ε/min_prev returns to a usable state in <~1s, no 404s even after a mid-session server restart.
- [ ] A second POI click while zoomed-in does not visibly recenter unless the point was off-screen; a recenter-to-city button exists.
- [ ] Cancel button aborts a running mine; panel shows stage + server `elapsed_s`.
- [ ] Inline validation on both inputs; out-of-range values are flagged, not silently clamped.
- [ ] Selecting a point highlights it (+ in-radius members) without hiding others; re-click deselects and closes the popup.
- [ ] Co-location relationship visible only in the popup, only for tier-1 POIs, phrased subtly; nothing rendered for tier-2.
- [ ] All English strings in `src/explorer/` replaced with Vietnamese; jargon simplified.
- [ ] 76 pytest + 48 vitest green; `no-prediction-copy.test.js` + `mining-request.test.js` guard pass unmodified.

## Risk Assessment

- **Popup group-context wiring (Phase 3):** `onSelectPoi` currently passes only
  the neighbour object with no back-reference to its pattern's `features`. Signal
  it broke: popup cannot show the relationship line. Response: attach the owning
  group's feature list onto each member when `groups` is built, or look up by id
  at popup-render time. Flagged so it is not underscoped.
- **New Phase-3 copy ("đang hiện N/M") slips through untranslated:** it is added
  after the Phase-4 translation pass was scheduled "last". Response: write
  Phase-3's new user-facing strings in Vietnamese inline as they are authored, OR
  explicitly reopen Phase-4 scope to include them. Do not leave English.
- **1.5 km circle vs zoom logic:** a 1.5 km `L.circle` is a very different zoom
  target than the current ~100 m default. Explorer is latlon-only, so low risk,
  but do a quick visual check once built (`leaflet-map.jsx` `closeEnough`).

## Open Questions

None — all forks resolved in brainstorm (list shape, city scope, subtle-signal
placement, cache strategy, tier-2 caps) and validation (below).

## Validation Log

### Verification Results (Standard tier, 4 phases)
- Claims checked: 12 (file paths + symbols across all phases)
- Verified: 12 | Failed: 0 | Unverified: 0
- Confirmed: `use-mining-job.js:97-104` `cancel()`; `mining-controls.jsx` `onCancel`+Cancel button; `job-progress.jsx:53` `job.elapsed_s` + `STAGE_LABELS`; `no-prediction-copy.test.js` `BANNED` (already `/predict/`, `/forecast/`, `/next stop/`, `/your next/`, `/sẽ đến tiếp/`) auto-scans `src/explorer/`; `attributes.js` `RENDERERS`/`ENUM`/`ORDER`; datasets philadelphia-cuisine 5725 / new-orleans 2426 rows; `discovery-radius-control.jsx:10` ε clamp; all `explorer-app.jsx`/`leaflet-map.jsx`/`poi-popup.jsx`/`cluster-group-list.jsx` line refs.

### Session 1 decisions (2026-08-18)
1. **Default discovery radius on POI click = mined ε (~100m); ceiling = 1.5 km.**
   Tier-1 shows immediately at the honest ε; user widens for tier-2. → Phase 3
   (`RADIUS_MAX_M ≈ 1500`; keep the existing render-time reset of `radiusM` to
   `minedEps` on a fresh result).
2. **Switching city while a mine is in-flight = cancel job A, then load B.**
   `handleSelectCity` must call `cancel()` (server DELETE) on any in-flight job,
   not only stop polling via `reset()`. → Phase 1.
3. **Per-city restore = instances[] + mine result only** (re-click to see around).
   No `selected`/`detail`/popup in the cache. KISS. → Phase 1.

### Whole-Plan Consistency Sweep
Re-read `plan.md` + all 4 phase files after propagation. No contradictions: the
1.5 km ceiling + ε default (decision 1) agree across `plan.md` "Tier-2 UX",
Phase 3 architecture, and success criteria; cancel-in-flight (decision 2) is
additive to the existing "re-run `run()` hits disk cache" flow, no conflict;
instances-only cache (decision 3) matches the issue-3 decision bullet in
`plan.md`. No stale terms, renamed symbols, or duplicated contracts. Zero
unresolved contradictions → eligible for implementation.

