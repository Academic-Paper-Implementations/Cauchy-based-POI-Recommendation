---
title: "Phase 2: Beginner guide modal"
status: done
priority: P2
dependencies: [1]
---

# Phase 2: Beginner guide modal

## Overview

A `?` button in a corner of the Explorer opens a modal that explains every
metric a newcomer sees, plus a short how-to-use. Item #5. Self-contained new
component; depends on Phase 1 only so its copy is authored in English from the
start.

## Requirements

- Functional
  - A `?` (help) button visible in a fixed corner (e.g. top-right of the map,
    near the recenter button) at all times.
  - Clicking it opens a modal explaining, in plain English:
    - **Search distance (ε)** — how close two places must be to count as
      together; the mine-time co-location distance.
    - **Popularity (min_prev)** — how common a pattern must be to be kept
      (0–1 share of instances).
    - **Co-location** — places whose types repeatedly appear near each other in
      the mined patterns; "Co-located places" in the list.
    - **Rating & review count** — Yelp stars and how many reviews.
    - **Price ($ tiers)** — `$`–`$$$$` = Yelp price level 1–4, cheap→expensive.
    - **"Around here" radius** — a view-only filter (does not re-mine); up to
      1500 m; only widens the "Other nearby" list.
    - **How to use** — pick a city → set distance/popularity → run → click a
      place → read its co-located + nearby types.
  - Close via ✕ button, overlay click, and the Esc key.
- Non-functional
  - No new dependency; plain React + Tailwind, matching the existing dark theme.
  - Accessible: focusable trigger, `role="dialog"`, `aria-modal`, Esc handling,
    focus not trapped behind the overlay.

## Architecture

New `src/explorer/guide-modal.jsx` exporting a `GuideModal` (content + open/close
chrome) — or a small `{ open, onClose }` presentational modal plus a trigger
button rendered by `explorer-app.jsx`. Local `useState(false)` in
`explorer-app.jsx` owns open state (KISS — no context). The metric copy is
static JSX; reuse the ε/radius numbers already in scope (`minedEps`,
`RADIUS_MAX_M`) only if convenient — static text is acceptable.

## Related Code Files

- Create: `src/explorer/guide-modal.jsx`
- Create: `src/explorer/guide-modal.test.jsx` (opens on click, closes on Esc/✕/
  overlay, renders the key metric headings)
- Modify: `src/explorer/explorer-app.jsx` (guide open state + `?` trigger button)

## Implementation Steps

1. Build `GuideModal({ open, onClose })`: overlay + centered panel, ✕ button,
   Esc listener (effect adding/removing `keydown`), overlay-click close, sections
   for each metric above, and a "How to use" ordered list.
2. Add a `?` button in `explorer-app.jsx` (fixed corner, same z-layer as the
   recenter button) toggling `guideOpen`.
3. Style to match the existing slate theme; ensure it scrolls on small heights.
4. Write `guide-modal.test.jsx`: render, click trigger → dialog visible; press
   Esc → closed; click ✕ → closed; assert a couple of metric headings render.
5. Run vitest.

## Success Criteria

- [ ] `?` button always visible; opens the modal.
- [ ] Modal explains ε, popularity, co-location, rating, price tiers, and radius,
      plus a how-to.
- [ ] Esc, ✕, and overlay click all close it.
- [ ] `guide-modal.test.jsx` passes; suites stay green.
- [ ] All modal copy is English; no-prediction guard still passes.

## Risk Assessment

- **Risk:** Modal z-index sits under the Leaflet map / popup. *Signal:* trigger
  works but panel is hidden. *Response:* reuse the `z-[1000]` layer the popup and
  recenter button already use; bump if needed.
- **Risk:** Esc listener leaks across renders. *Signal:* duplicate handlers /
  console warnings. *Response:* add/remove in a single `useEffect` keyed on
  `open`.
