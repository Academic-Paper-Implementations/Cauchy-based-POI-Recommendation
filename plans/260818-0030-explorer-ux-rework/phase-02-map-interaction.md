---
phase: 2
title: "Free map interaction"
status: done
priority: P2
effort: "0.5d"
dependencies: [1]
---

# Phase 2: Free map interaction

## Overview
Stop the map from yanking the view on every selection, and give the user a
button to recenter on the current city. Issue 6.

## Requirements
- Functional:
  - Selecting a POI keeps the user's current pan/zoom when the point is already
    visible and legibly close; it only recenters when needed.
  - A "recenter to city" control refits the whole dataset on demand.
- Non-functional: preserve the first-click zoom-in that makes a tens-of-metres ε
  circle legible; do not remove it.

## Architecture
- Today `leaflet-map.jsx:164` calls
  `map.setView(center, Math.max(map.getZoom(), closeEnough))` on every
  `selected`/`radiusM` change — it never zooms out but ALWAYS recenters, throwing
  away a manual pan. The zoom-in is load-bearing (`leaflet-map.jsx:149-154`
  explains why: at city-wide start zoom an ε of tens of metres is sub-pixel).
- Make the recenter **conditional**: only call `setView` when the selection is
  actually off-screen or too far out —
  `!map.getBounds().contains(center) || map.getZoom() < closeEnough`. Otherwise
  leave the view where the user put it.
- Add a recenter button (small control over the map in `explorer-app.jsx`'s
  `<main>`, or a Leaflet control) that calls `fitBounds` over all `instances`
  (the same call already at `leaflet-map.jsx:99-101`). Expose it via a ref/prop
  callback from `LeafletMap` (e.g. `onReady`/imperative handle) or lift a
  `recenterToken` prop that the map watches.
- Keep the instances-change `fitBounds` (`leaflet-map.jsx:99`) — that is the
  correct initial framing on dataset load, not the bug.

## Related Code Files
- Modify: `src/components/leaflet-map.jsx` (conditional `setView`; expose recenter)
- Modify: `src/explorer/explorer-app.jsx` (recenter button in `<main>`)
- Tests: `src/components/leaflet-map.test.jsx` if present, else a focused test for the conditional-recenter predicate (extract it as a tiny pure helper to keep it testable without a live map)

## Implementation Steps
1. Extract a pure `shouldRecenter(map, center, closeEnough)` helper and unit-test it.
2. Replace the unconditional `setView` at `leaflet-map.jsx:164` with a guarded call.
3. Add a recenter affordance (button) wired to `fitBounds(instances)`.
4. Manual/visual check: pan away, click a second point → view stays; click an
   off-screen point → view moves.

## Success Criteria
- [ ] Clicking a second POI while zoomed-in and on-screen does not move the map.
- [ ] Clicking an off-screen POI still brings it into view at a legible zoom.
- [ ] First click from city-wide zoom still zooms in enough to see the ε circle.
- [ ] Recenter button refits the whole city.

## Risk Assessment
- **Over-suppressing recenter** could leave a selected point invisible. Signal:
  user selects a point they can't see. Mitigation: the `!bounds.contains` half of
  the predicate guarantees off-screen points still recenter; only on-screen +
  close-enough selections are left alone.
