# Brainstorm — Investor Recommendation Mode + Frontend Remediation

Date: 2026-08-12 · Branch: `master` · Precedes: plan skill → `/ak:cook`
Inputs: `plans/reports/review-260812-2258-frontend-review.md`, 3 user decisions, measured benchmark.

## Contract

**Outcome.** Desktop web app with two modes. *Mining view* keeps today's algorithm evidence
(κ, WPI, deduced, full pattern table). *Investor view* answers two questions: "tại điểm này nên
đầu tư feature nào?" and "chọn feature X → khu vực nào phù hợp?". Both map paths (lat/lon and
X/Y-only) run on one Leaflet component. Panels scroll inside their own frame instead of stretching
the page.

**Constraints.**
- Desktop web only; mobile is not a target (user decision 2).
- The X/Y-only dataset (Toronto, 17,128 instances) stays in use (user decision 1).
- Demo latency: recommendation requests must feel immediate — no multi-second stalls.
- No re-mining for either recommendation; both derive from an existing mined result, like the
  rare-threshold slider already does.
- Preserve the public contract of existing endpoints; new capability arrives as new endpoints.
- Recommendations are a heuristic over mined co-location patterns, presented as such. The app must
  not imply a validated prediction of business success.

**Non-goals.**
- Mobile/tablet layout beyond "does not visibly break".
- Changing the C++ miner, the WPI/Cauchy weighting, or the clique algorithm.
- Authentication, persistence of investor scenarios, multi-user state.
- Demographic/economic data fusion (rent, footfall, income). Only mined co-location is in scope.
- Migrating to TypeScript.

**Acceptance criteria.**
1. Pattern list with 1,000+ rows scrolls inside its card; page height never exceeds viewport in
   either mode; card headers stay visible.
2. Map renders at full panel height in both modes and both CRS paths; `plotly.js` and
   `react-plotly.js` are absent from `package.json` and from the built bundle.
3. Clicking a point in Investor view returns a ranked table of candidate features with score,
   supporting-pattern count, and existing-nearby count.
4. Choosing a feature returns ranked regions, drawn on the map and listed; p95 server time
   < 500 ms on Philadelphia at ε = 80 m.
5. Every input/select has a visible focus indicator and an associated label.
6. Vitest covers the poll state machine, both recommendation panels, and the CRS branch.

---

## Decisions taken

| # | Decision | Source |
|---|---|---|
| 1 | Two modes (Investor / Mining), toggled in the header | user |
| 2 | Unify on Leaflet; `L.CRS.Simple` for X/Y; delete Plotly | user |
| 3 | Area recommendation = **occupied ε-cells, scored, then flood-filled into regions** (A+C) | measured, below |

### Decision 3 was settled by measurement, not preference

Ran the three candidate designs against the real 9,928-instance Philadelphia data
(`scratchpad/bench_area.py`). The decisive fact is that the dataset has **20 features**, so
feature presence fits in a 20-bit integer and "is pattern P supported here?" becomes one
`AND` + compare.

```
eps = 80 m
  full grid over bbox         : 428,359 cells
  occupied cells              :   4,695      <- 99.0% of the bbox is empty
  presence-mask dilation      :      11 ms
  distinct presence masks     :   2,270      <- memoisation hits ~52%
  mean features present/cell  :     4.9

  [A] grid score,  100 patterns of F :   20 ms
  [A] grid score,  500 patterns of F :   89 ms
  [A] grid score, 2000 patterns of F :  355 ms
  [B] per-instance sites, 500 patterns :  97 ms   (and this reused A's cell masks —
                                                   a true per-site radius query costs far more)
  [C] flood-fill top 10% of cells      :    3 ms  -> 32 regions, median 3 cells
```

- **Scoring only occupied cells** is a 60–180× saving over the bounding box and loses nothing:
  an empty cell has no supporting features, so its score is zero by construction.
- **Option B (score every existing site)** is not cheaper once done honestly, and returns scattered
  points rather than "khu vực" — it answers a different question than the user asked.
- **Option C's clustering costs 3 ms** on top of A. It is effectively free, and it is the step that
  turns cells into the regions the user actually asked for.

Chosen: **A + C**. Worst measured case ~370 ms, cacheable per `(result_key, feature, eps)`, so the
second request on the same feature is instant. Toronto is ~1.7× the instances but similar cell
counts; still comfortably inside the 500 ms criterion.

---

## Scoring semantics

Both recommendations rest on one idea, stated once: **a location is attractive for feature `B` when
the other members of a prevalent pattern containing `B` are already present nearby, and `B` is not.**

Deduced patterns carry `wpi: null` (`report_writer.cpp:203`, engine invariant in `miner.h:20-27`).
They are prevalent by Lemma 2, so their true WPI is ≥ `min_prev`. Substitute `min_prev` as a lower
bound rather than dropping them — principled, and keeps large deduced patterns from vanishing.

**Per-point (click a location).** For selected instance of feature `A` at `p`, for each candidate
`B ≠ A`:

- `S(B)` = prevalent patterns `P` with `{A, B} ⊆ P`
- `P` is *ready* when every feature in `P \ {B}` is present within ε of `p`
- `score(B) = Σ wpi(P)` over ready `P`
- also report: ready/total pattern count, `existing(B)` = instances of `B` already within ε
  (saturation/competition), and the rare flag

Cost: one existing `grid.within()` call plus a loop over patterns containing `A`. Sub-10 ms.

**Per-feature (choose `F` → regions).** For each occupied cell `c` with presence mask `m`:

- `score(c) = Σ wpi(P)` over `P ∋ F` where `mask(P \ {F}) & m == mask(P \ {F})`
- `saturation(c)` = instances of `F` already in `c`; surface it as a separate column so the user
  distinguishes "strong area, already crowded" from "strong area, gap"
- flood-fill contiguous high-scoring cells → region with centroid, bbox, score, top supporting
  patterns

---

## Delivery shape

Five phases. 1 and 2 are prerequisites for the new panels; 3 is independent backend work and can run
in parallel with 2.

**Phase 1 — Layout and failure boundaries (desktop).**
Root cause of the reported scroll bug is confirmed: `App.jsx:276-299` gives both wrapper `div`s a
definite height via `min-h-0 flex-1`, but the `.card` roots in `pattern-list.jsx:78` and
`instance-detail.jsx:28` have no `h-full`, and `.card` in `index.css:26` sets no height. The card
grows to content height and overflows the wrapper, so the inner `overflow-auto` — itself `flex-1` of
an auto-height parent — never engages. Fix: `h-full` on both card roots. Also in this phase: map
panel height, `ring:`→`outline` focus fix (`index.css:74-79, 89-94` are inert Tailwind utility names
in plain CSS), poll-error channel split, error boundary.

**Phase 2 — One map component.**
`leaflet-map.jsx` takes a `crs` prop. Lat/lon → `EPSG3857` + OSM tiles. X/Y → `L.CRS.Simple`,
no tiles, `minZoom` negative (Philadelphia extent is 64,575 m, so at CRS.Simple zoom 0 one unit is
one pixel — needs roughly `minZoom: -10`), coordinates passed as `[y, x]`. `L.circle` radius stays
in metres because CRS.Simple map units are our metres. Optional graticule for the lost Plotly axes.
Delete `SpatialMap.jsx`, drop both Plotly deps (−4,865 kB / −1,478 kB gzip, measured).

**Phase 3 — Recommendation endpoints.**
`GET /api/jobs/{id}/instances/{feature}/{number}/recommendations`
`GET /api/jobs/{id}/site-recommendations?feature=F&top=N`
New module `server/recommendation.py`: feature-bitmask index, per-cell presence masks, memoised cell
scoring, flood-fill clustering. Cache per `(result_key, eps_m)` beside the existing `_INDEX_CACHE` /
`_GRID_CACHE` (`main.py:61-62`). Pytest to match the existing suite.

**Phase 4 — Investor / Mining mode split.**
Header toggle. Mining view = today's panels. Investor view = recommendation table (replaces the
instance pattern list) + feature picker + ranked region list + region overlay on the map.

**Phase 5 — Interaction and hygiene.**
Rare-slider debounce + `AbortController` (`App.jsx:139-148` currently issues ~20 full result
requests per drag, with no stale-response guard), instances loading state, `htmlFor`/`id` labels,
keyboard-reachable table rows, `useMiningJob` extraction, kebab-case renames, move
`tailwindcss`/`postcss`/`autoprefixer` to `devDependencies`, Vitest.

---

## Risks

| Risk | Mitigation |
|---|---|
| Pattern count for a feature far above the 2,000 tested → slower than 500 ms | Measured cost is linear in patterns-of-F; cap `top` and cache per feature. Re-measure once a real result is cached. |
| `L.CRS.Simple` zoom/bounds tuning is fiddly at 64 km extent | Phase 2 is isolated and reversible; verify against both datasets before deleting `SpatialMap.jsx`. |
| Recommendation reads as a business-success prediction | Label the panel as co-location support, show the supporting patterns, keep `saturation` visible. |
| Two modes double the surface to keep working | Shared map + controls; only the right-hand panels differ. |
| Bitmask assumes ≤ 64 features | True for both datasets (20). Uploaded CSVs could exceed it — fall back to `frozenset` above 64, or cap and report. |

## Unresolved questions

1. Region ranking for the demo: by total score (favours large areas) or by peak cell score (favours
   sharp opportunities)? Suggest showing both columns and defaulting to peak.
2. Should the Investor view hide `deduced`/WPI vocabulary entirely, or keep a "why?" expander that
   reveals the supporting patterns? The expander is more defensible for an academic demo.
3. Uploaded CSVs with > 64 distinct features: cap, or fall back to the slower set-based path?
4. Does the Mining view keep the current instance-pattern panel unchanged, or also gain the
   supporting-pattern expander built in Phase 4?
