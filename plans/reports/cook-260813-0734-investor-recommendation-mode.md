# Cook — Investor Recommendation Mode

Date: 2026-08-13 · Branch: `master` · Plan: [260812-2325-investor-recommendation-mode](../260812-2325-investor-recommendation-mode/plan.md)
All five phases delivered. Gates: `npm run lint` clean, `npm test` 25 passed, `npm run build` clean, `pytest server/tests` 73 passed.

## What shipped

| Phase | Result |
|---|---|
| 1 — layout, failure boundaries | `h-full` on both card roots (the actual scroll bug), map height per breakpoint, `:focus-visible` outlines replacing the inert `ring:` declarations, three separate error channels, error boundary |
| 2 — one map | `leaflet-map.jsx` serves both CRS; `SpatialMap.jsx` + `mining-map.jsx` deleted; Plotly removed |
| 3 — recommendation backend | `server/recommendation.py` + two endpoints, presence/area caches, `MAX_FEATURES = 64` on upload |
| 4 — Investor / Mining split | header toggle, two new panels, "Lý do" expander, region overlay |
| 5 — interaction, a11y, tests | debounce + abort + stale-response guards, `use-mining-job.js`, label associations, kebab-case rename, Vitest |

## Measured, not assumed

**Bundle.** Plotly chunk 4,865 kB (1,478 kB gzip) gone. Total JS 5,253 kB → 400 kB; production build 32 s → 4.8 s.

**Recommendation latency**, against the real cached results:

| dataset | site-recs p95 | point-recs p95 | presence build |
|---|---|---|---|
| Philadelphia ε=80 m, 175 patterns | **10 ms** (criterion < 500) | 2.6 ms (criterion < 50) | 14 ms |
| Toronto ε=120 m, 647 patterns | 36 ms | 5.2 ms | 29 ms |

The plan's 355 ms figure was a synthetic 2,000-pattern case. The worst real feature (Restaurants, 76 patterns of 4,564 scored cells) costs 10 ms.

**Slider debounce.** A full 0→100 drag at step 5 — 21 discrete positions — now issues **1** `/result` request, landing on the final value. Counted from `performance.getEntriesByType('resource')` in the running app; previously 20 result + 20 detail requests with no stale-response guard.

**`deduced` is a cold path.** Both real results have a computed WPI for every pattern (Philadelphia 175/175, Toronto 647/647), confirming the plan's expectation. The `min_prev` substitution is covered by unit test rather than by real data.

## Two defects found while verifying

**1. Stale `focusRegion` hijacked the map across a dataset switch.** Switching to Toronto rendered a blank grey map. Not a CRS problem: the region focused in Philadelphia survived the switch, and its bbox — Philadelphia metres — re-framed the new map onto an empty corner of Toronto's extent. Fixed by clearing the focus with the rest of the dataset-scoped state, and again whenever the chosen feature changes. Toronto then rendered correctly (23 km × 56 km, north-up, ε circle at true metre radius).

**2. A point picked in Investor view left Mining view blank.** Each view answers a click through its own endpoint and neither fires while the other is closed, so switching to Mining with a selection already made showed an empty detail card. `changeMode` now fetches the pattern detail on that one transition.

## Deviations from the plan

**An existing test forbade the new endpoints.** `test_no_poi_recommendation_endpoints_remain` asserted that no route path contains `"recommend"`. It dates from the initial commit and guarded against re-importing the sibling `POI_recommend` project's user→business recommender. The co-location endpoints this plan requires are a different thing, and were an explicit user decision. The test was rewritten to state its real invariant — no `businesses`/`users` routes, and every recommendation route must hang off a mining job — rather than deleted.

**`participation_counts` added to supporting patterns.** Phase 4 reuses `PatternFeatures`, which reads per-feature instance counts; the recommendation payload did not carry them. Added server-side via the existing `participation_counts` helper instead of forking the component.

**CRS adapters live in `src/utils/crs.js`, not in the map component.** Exporting them from `leaflet-map.jsx` for testing broke the `react-refresh/only-export-components` lint rule. They are a coordinate utility, so they moved.

**UI language.** The plan writes the new labels in Vietnamese; the existing app UI is English. Confirmed with the user: new Investor panels use the plan's Vietnamese labels, existing controls stay English.

## Worth knowing

**Peak ranking ties often.** Region scores are sums over a small set of patterns, so many cells reach the same maximum — for Pizza on Philadelphia the top three regions all peak at 2.68 and are separated only by total score. The peak column is still the right default (it is what distinguishes a sharp block from a diffuse one when they differ), but on features with few patterns it degenerates and the Tổng column does the ordering. Both columns are visible, so this reads correctly rather than misleading.

**Not verified visually:** keyboard focus rings. The inert `ring:` declarations were replaced with real `:focus-visible` outlines and every control now has an associated label, verified by reading the CSS and markup — but nobody has tabbed through the form in a browser.

**Toronto is not in the Docker image.** It resolves through the sibling repository, so the CRS.Simple path is exercised in development. In a packaged deployment that branch is reached only by an X/Y-only CSV upload.

## Unresolved questions

None blocking. One judgement call worth revisiting after a demo: the region percentile threshold is fixed at 90, which on Philadelphia yields large downtown blobs (the top Pizza region spans 217 cells). If the demo wants tighter areas, that constant is the dial.
