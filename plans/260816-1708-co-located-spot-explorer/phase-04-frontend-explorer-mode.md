---
phase: 4
title: "Separate clean Explorer app"
status: pending
priority: P1
effort: "4-5d"
dependencies: [3]
---

# Phase 4: Frontend — separate, clean Explorer app

## Overview
Build a **separate, clean end-user Explorer frontend** (new folder/package) that reuses the
existing backend + engine. The user picks a city, runs a mine through the **standard job
flow** (they set distance ε + threshold), then **clicks a food/leisure POI** on the map to
see its co-located neighbours grouped by type-cluster, each with distance + rating + an
attributes popup, filtered by a **client-side discovery radius**. The existing Investor/
Mining spatial_web frontend is **not touched**.

## Requirements
- Functional: choose a city (Philadelphia / New Orleans); set mining controls (ε, threshold)
  and run a mine via the standard job flow; on the finished result, click a POI → see its
  co-located neighbours grouped (label = feature list, e.g. "Wine Bars + Tapas + Gelato");
  click a neighbour → popup (name, distance, rating, attributes present, missing =
  "unknown"); adjust a discovery-radius slider that filters displayed neighbours client-side.
- Non-functional: result view is jargon-free (no rare/WPI/κ in the discovery surface);
  "group of types", never "district"; the discovery radius is a pure client-side filter and
  never enters job params. Clean codebase — no Investor/Mining component baggage.

## Architecture
- **Separate app**: a new frontend folder (e.g. `explorer/` as its own Vite package, or a
  clean `src/explorer/` entry with its own build target). It talks to the SAME backend
  (`/api/datasets`, `/api/jobs`, `instance_recommendations`). Decide package-vs-entry at
  phase start; default to a self-contained folder so it deploys independently and shares
  nothing structural with the research UI.
- **Reused low-level utilities (clean copy/share, not the old components)**: the map/CRS
  projection stack — `utils/crs.js` (toLatLng/toBounds) and Leaflet setup from
  `leaflet-map.jsx:31-62` — and `utils/feature-colors.js`. Reuse these as shared low-level
  code; do NOT import the Investor/Mining component tree (mode-toggle, area/feature
  recommendations, mining-controls). Explorer uses **latlon CRS** (real map).
- **Mining controls (kept, clean UI)**: a minimal dataset picker + ε + threshold form that
  POSTs the standard `/api/jobs` and polls `/api/jobs/{id}` — same contract the research UI
  uses, re-implemented cleanly. Each mine reflects the user's parameters.
- **Click-POI discovery**: on a finished job, clicking a POI calls `instance_recommendations`
  (via a fresh clean `api.js`), which returns co-located neighbours + supporting pattern +
  per-neighbour distance/rating/attributes (Phase 3). Group neighbours by their supporting
  pattern's feature list.
- **Discovery radius (client-side)**: a slider holding a client value that filters which
  nearby POIs / neighbours are shown and draws the map circle. Never sent to `/api/jobs` as
  `eps_m`. Legend/tooltip: "clusters are defined at {ε} m; you're viewing {radius} m — some
  clusters may extend beyond the circle."
- **New components** (kebab-case, clean): `explorer-app.jsx` (root + layout),
  `city-mining-panel.jsx` (dataset picker + ε/threshold + run), `explorer-map.jsx` (Leaflet
  latlon, POI pins, radius circle, selected/neighbour highlight), `cluster-group-list.jsx`
  (neighbours grouped by feature-list label), `poi-popup.jsx` (name, distance, rating,
  attribute chips with unknown handling), `discovery-radius-control.jsx`.

## Related Code Files
- Create: `explorer/` (new frontend) — `explorer-app.jsx`, `city-mining-panel.jsx`,
  `explorer-map.jsx`, `cluster-group-list.jsx`, `poi-popup.jsx`, `discovery-radius-control.jsx`,
  a clean `api.js`, its own `index.html` + Vite config/build entry
- Reuse as shared low-level code (no behaviour change): `src/utils/crs.js`,
  `src/utils/feature-colors.js`, Leaflet init pattern from `src/components/leaflet-map.jsx:31-62`
- Do NOT modify: `src/App.jsx`, `src/components/mode-toggle.jsx`, Investor/Mining components
- Reference (contract only): `src/config/api.js:31-90` (existing call shapes to mirror cleanly)

## Implementation Steps
1. Scaffold the separate Explorer app (own entry/build) with a clean `api.js`; wire CRS +
   feature-colors as shared utilities.
2. City-mining panel: dataset picker (Phil/NOLA cuisine) + ε + threshold → POST `/api/jobs`,
   poll to completion (standard flow).
3. Explorer map (latlon CRS): load `/api/datasets/{city}/instances`, render food/leisure POI
   pins; select a POI on click.
4. On POI click → `instance_recommendations`; render `cluster-group-list` (feature-list
   labels) + map highlight of neighbours; ungrouped nearby dimmed so the map is never blank.
5. `discovery-radius-control` slider → client-side filter of displayed neighbours/POIs +
   radius circle overlay; never touches job params.
6. `poi-popup`: distance + rating + attribute chips; missing attribute → "unknown" (never
   "No"); "open now" only if computed at request time, else omit. Legend explains ε vs radius.

## Success Criteria
- [ ] Explorer is a separate clean app; Investor/Mining spatial_web frontend untouched.
- [ ] Pick a city → set ε/threshold → run mine → click a POI → grouped co-located neighbours
      (feature-list labels) with distance + rating render on map + list.
- [ ] Popup shows attributes present; missing = "unknown"; no rare/WPI/κ text in the
      discovery surface.
- [ ] Radius slider filters results instantly client-side; never sent as `eps_m`; legend
      explains ε vs radius.
- [ ] No UI text implies "predicting your next stop".

## Risk Assessment
- **Risk:** duplicating the frontend stack (separate app) re-introduces map bugs already
  fixed in the research UI. Mitigation: reuse `crs.js` + the proven Leaflet init as shared
  low-level code; snapshot-test `toLatLng`; Explorer always uses latlon CRS (pins in water =
  CRS inversion, crs.js:10-20).
- **Risk:** exposing ε/threshold to an end-user re-introduces jargon. Mitigation: label them
  plainly ("how close counts as nearby", "how common a pattern must be"); keep rare/WPI/κ out
  of the discovery result view. This honours the locked decision (mining controls kept) while
  keeping the result surface clean.
- **Risk:** empty neighbours at sparse spots / small radius frustrate users. Response: default
  discovery radius generous (~1-1.5 km per brainstorm), show ungrouped-nearby list so the map
  is never blank, prompt "widen radius".
