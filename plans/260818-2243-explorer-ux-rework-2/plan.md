---
title: "Explorer UX Rework 2"
description: "Second UX-rework round of the Co-located Spot Explorer (src/explorer/): full English, beginner guide modal, honest staged progress + mined-state badge, name search, popup fixes, sort-direction toggle, copy cleanup, and a static Vercel deploy. 13 user-feedback items, frontend-only, no backend changes."
status: done
priority: P1
effort: "3-5d"
tags: [explorer, frontend, ux, i18n, deploy, aip490]
created: 2026-08-18
---

# Explorer UX Rework 2

## Overview

A second round of feedback (13 items) on the shipped Co-located Spot Explorer
(`src/explorer/`). The prior rework (`plans/260818-0030-explorer-ux-rework/`,
**done**) added cancel + staged text progress, per-city cache, two-tier nearby
list, and a **full Vietnamese** locale. This round reverses the language to
English, adds self-explanation (guide modal, mined-state badge, honest staged
progress bar), a name search, popup bug fixes, a sort-direction toggle, small
copy cleanups, and a static Vercel publish of the frontend.

**Frontend-only.** The one backend touch is a two-line dataset-label edit
(`server/datasets.py`, item #13). No changes to the C++ miner, the job runner,
or any API contract — the badge/progress data (`pattern_count`,
`stage_index`/`stage_count`) is already served.

Brainstorm + 2 kongming rounds (2026-08-18) resolved every fork; decisions are
recorded inline below. Related done plan:
`plans/260818-0030-explorer-ux-rework/`.

## Contract

- **Outcome** — The Explorer is fully English; a `?` button opens a guide modal
  explaining every metric; the mining panel shows an honest staged progress bar
  (5 real stages) + a success banner and, when done, a mined-state badge
  ("Mined: <city> · ε=100 m · popularity=0.2 → N groups"); a name search box
  filters loaded POIs and selects one on the map; the popup renders fixed,
  correct rows (hours `10:00–21:00`, review count, labelled price tier); the
  nearby list has an ascending/descending sort-direction toggle; the header
  carries the team name **AIP490-G13**; stale copy is removed; and the frontend
  is published to Vercel as a static site (local backend, documented limitation).
- **Constraints** — KISS/DRY. The ε-vs-discovery-radius invariant is untouched
  (ε = mine-time co-location; radius = view-only client filter, never sent as
  `eps_m`). No arbitrary-point exploration. No "predict next POI" framing. No
  i18n framework (single hardcoded English locale). Existing pytest + vitest
  suites stay green; `no-prediction-copy.test.js` and the eps/radius guard in
  `mining-request.test.js` pass **unmodified**. No backend behaviour change
  beyond the dataset label strings.
- **Non-goals** — Vietnam / additional-cities data (still deferred to its own
  OSM/Overpass plan). A VI|EN toggle (user chose full English, no toggle).
  Raising the discovery-radius ceiling (stays 1500 m). A backend tunnel / hosted
  backend for the deploy (accepted local-only).
- **Acceptance** — see per-phase Success Criteria; roll-up below.

## Decisions locked (brainstorm + 2 kongming rounds, 2026-08-18)

- **Language = full English, no toggle.** The just-shipped Vietnamese copy is
  removed across `src/explorer/`. The four VN-string-asserting test files
  (`attributes.test.js`, `poi-popup.test.jsx`, `city-mining-panel.test.jsx`,
  `discovery-radius-control.test.jsx`) are updated **in the same commit** as the
  copy change — not deferred — or CI goes red on files that look untouched.
- **#13 label rename hides a dependency.** `explorer-app.jsx:18`
  `isCuisineDataset` filters the city dropdown with a `/cuisine/i` regex over
  `label || id`. Philadelphia's id is `philadelphia-cuisine` (survives), but
  New Orleans' id is `new-orleans` — it matches **only** via its label. Dropping
  "cuisine" from that label silently removes New Orleans from the picker. The
  filter is replaced with an explicit id allow-list in the same diff as #13.
- **Progress is honestly staged, not a fake %.** The backend already serves
  `stage_index`/`stage_count` (`server/mining_job.py:178-179`), so the bar shows
  a real 5-stage fraction + the current stage label + a success banner on
  `done`. No fabricated continuous %, no toast library (KISS — inline banner).
- **Mined-state badge** reads `result.pattern_count` (`server/main.py:236`) and
  `job.params` — no backend addition.
- **Search is name-only, client-side.** Filters the already-loaded `instances`
  by name and selects the match (reuses the existing click/select flow). No
  lat/long — arbitrary-point exploration was deliberately removed.
- **Popup keeps its compact layout**; only bugs are fixed (hours zero-padding,
  review count, labelled price). The `$`/`$$` is Yelp's price tier (1–4), not a
  bug — it is kept and labelled "Price".
- **Discovery-radius ceiling stays 1500 m** (`RADIUS_MAX_M`, item #12 unchanged).
- **Deploy is a static Vercel publish of the FE build** (`vite build` →
  `explorer.html` + assets). The working demo runs locally
  (`vite build` then FastAPI serves both same-origin). The Vercel copy cannot
  reach a `localhost` backend (mixed content) — this is documented, accepted.

## Phases

| # | Phase | Items | Status |
|---|-------|-------|--------|
| 1 | [Copy layer: English + cleanup + labels](./phase-01-start.md) | 1, 3, 9, 11, 13 | done |
| 2 | [Beginner guide modal](./phase-02-guide-modal.md) | 5 | done |
| 3 | [Sort toggle & popup fixes](./phase-03-sort-toggle-and-popup-fixes.md) | 8, 10 | done |
| 4 | [Mined badge & staged progress](./phase-04-mined-badge-and-progress-bar.md) | 6, 7 | done |
| 5 | [Name search & Vercel deploy](./phase-05-vercel-deploy.md) | 2, 4 | done |

Item **#12** (radius max) = no change. Item **#4** (search) is bundled into
Phase 5 with the deploy because both are additive and touch no Phase 1-4 files.

**Execute serially in phase order.** Phases 2, 4, and 5 all edit
`explorer-app.jsx` (4 and 5 in the same `<aside>`/`CityMiningPanel` region), so
they must not run in parallel. The frontmatter encodes this (Phase 4
`dependencies: [1, 2]`, Phase 5 `[1, 2, 4]`); Phase 3 is independent of that file
but is still run in order for simplicity. Do not dispatch 2/4/5 concurrently.

Deferred (separate plan): Vietnam / extra-cities data.

## Architecture touchpoints

| Area | Files |
|------|-------|
| Explorer shell / header / search | `src/explorer/explorer-app.jsx` |
| Mining panel / progress / badge | `src/explorer/city-mining-panel.jsx` |
| Radius control copy | `src/explorer/discovery-radius-control.jsx` |
| Nearby list / sort | `src/explorer/nearby-list.jsx` |
| Popup / rows | `src/explorer/poi-popup.jsx` |
| Attribute formatting | `src/explorer/attributes.js` |
| Guide modal (new) | `src/explorer/guide-modal.jsx` |
| Dataset labels | `server/datasets.py` |
| Build entry | `explorer.html`, `vite.config.js` |
| Deploy (new) | `vercel.json` |
| Copy guard (unmodified) | `src/explorer/no-prediction-copy.test.js` |
| Tests to update | `attributes.test.js`, `poi-popup.test.jsx`, `city-mining-panel.test.jsx`, `discovery-radius-control.test.jsx` |

## Success Criteria (roll-up)

- [x] Every user-facing string in `src/explorer/` is English; header shows the app title + `AIP490-G13`; subtitle reworded.
- [x] Both Philadelphia and New Orleans still appear in the city dropdown after the label rename (allow-list filter).
- [x] A `?` button opens a guide modal explaining ε, popularity, co-location, rating, price tiers, and radius, plus a short how-to; Esc/overlay/✕ close it.
- [x] Mining shows a staged bar filling across the 5 real stages with the stage label; a success banner appears on `done`; no `…` placeholder.
- [x] After a mine, a badge shows the mined city, ε, popularity, and group count.
- [x] The popup shows padded hours (`10:00–21:00`), a review count, and a labelled price tier; missing fields are still omitted (never "No").
- [x] The nearby list sort buttons toggle direction (distance near↔far, rating high↔low) with an arrow indicator.
- [x] A name search box filters loaded POIs and selects the match on the map.
- [x] `vercel.json` builds the frontend; the static Explorer loads at its route; the backend-required limitation is documented.
- [x] `no-prediction-copy.test.js` + `mining-request.test.js` guard pass **unmodified**; all other pytest + vitest suites green.

## Risk Assessment

- **Biggest risk — #3 done as "just translate strings".** If the English pass
  skips the `isCuisineDataset` allow-list fix (#13) or the four VN-string test
  updates, the PR looks complete but silently drops New Orleans and/or reds CI.
  *Signal:* NOLA missing from dropdown; vitest failures in the four files.
  *Response:* both are explicit Phase 1 acceptance items and step-level tasks.
- **New English micro-copy trips the copy guard.** Writing fresh English, a
  translator may reach for "predict", "next", "forecast" (banned in
  `no-prediction-copy.test.js`). *Signal:* that test fails. *Response:* run
  vitest after the rewrite; fix the **copy**, never the test.
- **Vercel deploy is a non-functional public link.** Mixed content blocks a
  `localhost` backend. *Signal:* the deployed Explorer loads but every API call
  fails. *Response:* documented, accepted (local-only demo); Vercel serves the
  static FE only. Not a bug to fix.
- **Two-entry build.** Vercel must publish the multi-input Vite build so
  `explorer.html` ships, not only `index.html`. *Signal:* 404 on the Explorer
  route. *Response:* Phase 5 verifies the built `dist/` contains `explorer.html`.

## Open Questions

None — all forks resolved in brainstorm + validation with the user (deploy
target = local-only, language = full English, search = name-only, radius max
unchanged) and two kongming rounds (label dependency, test collateral, honest
progress source).

<!-- slug: explorer-ux-rework-2 -->
