---
title: "Phase 5: Name search & Vercel deploy"
status: done
priority: P2
dependencies: [1, 2, 4]
---

# Phase 5: Name search & Vercel deploy

## Overview

Two additive, low-coupling items. #4: a name-only search box that filters the
loaded POIs and selects the match on the map. #2: publish the frontend build to
Vercel as a static site (backend runs locally; the public link is a cosmetic
copy with a documented limitation).

## Requirements

- Functional
  - #4 A search input filters the already-loaded `instances` by name
    (case-insensitive, substring). Choosing a result selects that POI exactly as
    a map click does (opens its popup, drives the nearby list). No lat/long
    input. No new API calls.
  - #2 `vercel.json` (or Vercel project settings) builds the app with
    `vite build` and serves the static `dist/` output, including `explorer.html`.
    A short deployment note documents that the Explorer's API calls require the
    local backend and will not function against the public link (mixed content /
    no hosted backend).
- Non-functional
  - Search is client-side only; empty query = no filter; no results = a clear
    "no matches" affordance.
  - Deploy config is minimal and does not change local dev
    (`npm run dev` / `dev:all`) or the local prod path (FastAPI serving `dist/`).

## Architecture

- **#4 search** — `explorer-app.jsx` already holds `instances` and
  `handlePoiClick(poi)`. Add a search field (in the left panel, above the nearby
  list or near the city picker). Filter `instances` by `name`; render up to N
  matches; selecting one calls the existing `handlePoiClick` with that instance
  — reusing the select/popup/nearby flow, no new state machine. Requires a mined
  result for the co-location detail (same as clicking); before a mine, selecting
  can still pan/open the popup (matches current click behaviour where
  `handlePoiClick` sets `popupPoi` regardless and only fetches patterns when a
  job is done).
- **#2 deploy** — the build already emits two entries (`index.html`,
  `explorer.html`) via `vite.config.js` rollup inputs. Vercel static build:
  build command `vite build`, output dir `dist`. The Explorer is reachable at
  `/explorer.html`. `VITE_API_BASE` stays empty (same-origin) — accepted
  non-functional on Vercel; the real demo is local. Optionally add a rewrite so
  `/` or `/explorer` resolves to `explorer.html` for a cleaner URL (optional,
  not required).

## Related Code Files

- Modify: `src/explorer/explorer-app.jsx` (search input + filtered results →
  `handlePoiClick`)
- Create: `src/explorer/poi-search.jsx` (optional small presentational component
  if the input + results list is more than a few lines)
- Create: `src/explorer/poi-search.test.jsx` (filter by name; selecting a match
  triggers select)
- Create: `vercel.json` (static build config)
- Modify: `docs/` deployment note (existing explorer/deploy doc if present;
  otherwise a short section) documenting the local-backend limitation

## Implementation Steps

1. Add a controlled search input to `explorer-app.jsx`; compute filtered matches
   from `instances` by case-insensitive name substring (cap the list, e.g. 10).
2. Render matches as a small dropdown/list; clicking one calls `handlePoiClick`
   with that instance and clears/collapses the results.
3. Handle empty query (no list) and no-matches (a short "No matches" line).
4. Add `poi-search.test.jsx` (or extend an existing test): typing filters;
   selecting invokes the select handler.
5. Add `vercel.json` with `buildCommand: "vite build"`, `outputDirectory:
   "dist"`; verify a local `npm run build` produces `dist/explorer.html`.
6. Document the deployment + its local-backend limitation in the docs deploy
   note; do not claim the public link is a working end-to-end app.
7. Run vitest + a local build.

## Success Criteria

- [ ] Typing a name filters the loaded POIs; selecting a match selects it on the
      map (popup + nearby list), identical to a click.
- [ ] No lat/long input; search makes no API calls.
- [ ] `npm run build` emits `dist/explorer.html` and assets; `vercel.json`
      builds the static site.
- [ ] The deployed Explorer loads (static); the docs note states the API needs
      the local backend and the public link is a cosmetic copy.
- [ ] `poi-search.test.jsx` passes; suites stay green.

## Risk Assessment

- **Risk:** Vercel publishes only `index.html`, 404-ing the Explorer. *Signal:*
  `/explorer.html` 404 on the deploy. *Response:* step 5 confirms the multi-input
  build emits `explorer.html`; set output dir to `dist`, not a single entry.
- **Risk:** Search selecting a POI before a mine is confusing (no co-location
  detail yet). *Signal:* selecting shows a popup but empty nearby list.
  *Response:* mirror current click semantics exactly (popup always; detail only
  when a job is done) — no new behaviour to explain.
- **Risk:** Someone expects the Vercel link to work end-to-end. *Signal:*
  "the deployed app is broken" report. *Response:* the docs note + plan contract
  state local-only explicitly; this is accepted scope, not a defect.
