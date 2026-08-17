---
phase: 3
title: "Two-tier nearby list & selection"
status: done
priority: P1
effort: "3d"
dependencies: [1, 2]
---

# Phase 3: Two-tier nearby list & selection

## Overview
The largest, most coupled change: replace the per-pattern cluster list with a
flat two-tier "around here" list (co-located places + other nearby places),
make the discovery radius flexible up to ~1.5 km for tier-2, give the map a
third visual state, and make selection toggle-off. Issues 7, 9, 8. These share
the same restyle effect and radius state, so they ship together.

## Requirements
- Functional:
  - One flat, de-duplicated list with two tiers:
    - **Tier 1 — co-located places:** members of mined patterns the clicked POI
      participates in, within `min(radius, ε)`. One row per POI id (deduped).
    - **Tier 2 — other nearby places:** any loaded POI within the radius that is
      NOT a tier-1 member. Radius may exceed ε, up to ~1.5 km.
  - Both tiers sortable: default distance-ascending, toggle rating-descending.
    (No review-count sort.)
  - Tier-2 list capped to ~15–20 rows with *"đang hiện N/M — mở rộng bán kính"*.
  - Discovery radius slider ceiling raised to ~1.5 km (tier-2). Caption keeps the
    honest two-number wording ("nhóm hình thành trong εm; đang hiện trong Ym").
  - **Subtle co-location signal:** in `PoiPopup` only, only for a tier-1 POI, one
    muted line *"Thuộc nhóm đồng vị với X + Y"* (or *"Thuộc N nhóm đồng vị"*).
    Render nothing for tier-2 — never "không đồng vị".
  - Map: three visual states — selected, in-radius member, other (kept visible,
    not dimmed to near-invisible). Re-clicking the selected POI deselects and
    closes the popup.
- Non-functional: tier-2 distances client-side via projected x/y (Euclidean),
  matching backend `distance_m`; never send radius to the backend.

## Architecture
- **Tier 1 (co-located):** keep the existing `groups` build
  (`explorer-app.jsx:112-124`, filtered by `radiusM <= minedEps`), but flatten +
  dedup by POI id into a single tier-1 list (the map already dedups via
  `mapNeighbors` at `explorer-app.jsx:127-133` — mirror that for the list). When
  flattening, **attach each member's owning pattern `features`** onto the row so
  the popup can show the relationship line (see wiring gap below).
- **Tier 2 (other nearby):** compute client-side in `ExplorerApp` from the full
  `instances[]` by Euclidean distance on `x`/`y` to the selected origin, filter
  `distance <= radiusM`, exclude tier-1 ids and the origin, sort, cap. This
  needs no backend call and is unbounded by ε. (Do NOT widen the backend
  `grid.within()` — phase-04 explicitly forbids faking reach past ε.)
- **Radius control:** `discovery-radius-control.jsx:10` currently clamps `max` to
  `epsM`. Raise the slider ceiling to `RADIUS_MAX_M = 1500` (Validation decision 1
  — 1.5 km). Tier-1 still self-caps at ε in its own filter, so the honest
  invariant holds without clamping the slider. Update the caption copy.
- **Default radius on click (Validation decision 1):** keep the existing
  render-time reset of `radiusM` to `minedEps` (~100 m) when a fresh result lands
  (`explorer-app.jsx:41-44`). Tier-1 shows immediately at the honest ε; the user
  widens the slider toward 1.5 km to populate tier-2. Do NOT auto-open the radius
  wide on click.
- **List component:** restructure `cluster-group-list.jsx` (or replace with a new
  `nearby-list.jsx`) into two labelled sections with a sort toggle and the
  "N/M" cap line. One row per POI; no per-pattern grouping section.
- **Map third state:** in the restyle effect (`leaflet-map.jsx:106-125`), stop
  dimming non-members to `DIMMED_STYLE` (opacity 0.12); keep them at
  `BASE_STYLE`. Add a distinct style for the selected origin (e.g. red
  center/ring) and keep the in-radius member ring. Selected + members
  `bringToFront`.
- **Selection toggle:** in `handlePoiClick` (`explorer-app.jsx:92-109`), if the
  clicked POI id equals the current `selected` id, call `clearSelection()`
  (which already closes the popup, `explorer-app.jsx:53-59`) instead of
  reselecting.

### Wiring gap to close (flagged in brainstorm)
`ClusterGroupList.onSelectPoi(poi)` (`cluster-group-list.jsx:37`) passes only the
neighbour object — no back-reference to its pattern's `features`. `PoiPopup` has
no way to know group membership today. Fix by attaching the owning group's
feature list onto each member row when tier-1 is built (`explorer-app.jsx:112-124`),
or a lookup-by-id against tier-1 at popup-render time. Pick the attach approach
(simpler, keeps popup pure). A POI in multiple patterns → collapse to
*"Thuộc N nhóm đồng vị"*.

<!-- Updated: Validation Session 1 - default radius = ε on click; ceiling RADIUS_MAX_M = 1500 -->

## Related Code Files
- Modify: `src/explorer/explorer-app.jsx` (flatten+dedup tier-1 w/ features; compute tier-2; selection toggle; keep radiusM=ε default on result)
- Modify: `src/explorer/discovery-radius-control.jsx` (raise ceiling to ~1.5 km; caption)
- Modify: `src/explorer/mining-request.js` (only if a shared `RADIUS_MAX_M` belongs here; else keep radius constants in the control)
- Modify: `src/explorer/poi-popup.jsx` (subtle tier-1 relationship line; nothing for tier-2)
- Modify: `src/components/leaflet-map.jsx` (three-state restyle; selected origin style)
- Replace/restructure: `src/explorer/cluster-group-list.jsx` → two-tier flat list + sort toggle + N/M cap
- Tests: `src/explorer/cluster-group-list.test.jsx` (rework), new tests for tier-2 distance/dedup/cap, selection toggle, popup relationship line
- Guard (unmodified): `src/explorer/no-prediction-copy.test.js` auto-scans new `src/explorer/` files — do NOT use "gợi ý"/"đề xuất" for tier-2 copy

## Implementation Steps
1. Extract a pure `euclidean(a, b)` on x/y and a `nearbyOthers(instances, origin, radius, excludeIds, cap, sort)` helper; unit-test.
2. Flatten tier-1 with attached pattern `features`; dedup by id (collapse multi-pattern to count).
3. Compute tier-2 in `ExplorerApp`; exclude tier-1 ids + origin.
4. Restructure the list component: two sections, sort toggle (distance/rating), N/M cap line.
5. Raise radius ceiling + update caption; verify tier-1 still self-caps at ε.
6. Add the subtle relationship line to `PoiPopup` (tier-1 only).
7. Map: remove near-invisible dimming, add selected-origin style, keep member ring.
8. Selection toggle in `handlePoiClick` (re-click → deselect + close popup).
9. Write Phase-3's new user-facing strings in Vietnamese inline (cap line, tier headers, relationship line) so they don't slip past Phase 4.
10. Tests green; visual check of the 1.5 km circle vs zoom (`closeEnough`).

## Success Criteria
- [ ] Clicking an isolated POI shows tier-2 nearby places (panel never empty when POIs exist in range).
- [ ] No duplicate rows across the list (deduped by id); a multi-pattern POI shows once.
- [ ] Radius slider reaches ~1.5 km; tier-1 members never appear beyond ε; caption states both numbers.
- [ ] Tier-2 distances match the backend metric (projected x/y), sortable by distance/rating, capped with an "N/M" line.
- [ ] Popup shows the subtle relationship line only for tier-1 POIs; nothing for tier-2.
- [ ] Selecting a point keeps other points visible; re-clicking it deselects and closes the popup.
- [ ] `no-prediction-copy.test.js` passes unmodified (no prediction/recommendation framing in new copy).

## Risk Assessment
- **Popup wiring underscoped.** Signal: relationship line can't render / shows for
  tier-2. Response: attach owning-group `features` at tier-1 build time; gate the
  line strictly on tier-1 membership.
- **Tier-2 wall of text at 1.5 km** (Philadelphia has 5,725 instances). Signal:
  hundreds of rows. Response: the ~15–20 row cap + "N/M" line (this is also
  phase-04's own never-shipped "map never blank" mitigation). Marker perf is fine
  (map already renders ~10k markers).
- **New copy untranslated.** Signal: English "showing N of M" in a VN UI.
  Response: author Phase-3 strings in Vietnamese inline (step 9).
