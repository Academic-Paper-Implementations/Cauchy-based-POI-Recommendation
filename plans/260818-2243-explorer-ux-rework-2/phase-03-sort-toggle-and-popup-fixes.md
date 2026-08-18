---
title: "Phase 3: Sort toggle & popup fixes"
status: done
priority: P2
dependencies: [1]
---

# Phase 3: Sort toggle & popup fixes

## Overview

Two independent UI refinements. #10: the nearby list gains an ascending/
descending sort-direction toggle. #8: the popup keeps its compact layout but
fixes the hours format, shows a review count, and labels the price tier. Both
depend only on the Phase 1 English copy.

## Requirements

- Functional
  - #10 Clicking an already-active sort button flips its direction:
    - distance: near→far / far→near
    - rating: high→low / low→high
    with an arrow indicator (↑/↓) on the active button.
  - #8a Opening hours render zero-padded: Yelp `"10:0-21:0"` → `"10:00–21:00"`.
  - #8b Review count shown next to the rating (already partly present — ensure it
    renders in the standardized row).
  - #8c Price renders as a labelled tier, e.g. "Price $$" (keep `$`.repeat(n),
    n=1–4; it is Yelp's price level, not a bug).
- Non-functional
  - Missing attributes still produce no row (the "missing ≠ No" invariant in
    `attributes.js` is preserved).
  - New/updated assertions cover the hours padding and the sort direction.

## Architecture

- **#10 sort** — `nearby-list.jsx` currently holds `sortBy` state and a
  `sortItems(items, sortBy)` that sorts rating desc / distance as-is. Add a
  `dir` ('asc' | 'desc') dimension. Clicking the active field flips `dir`;
  clicking the other field switches field and resets to its natural default
  (distance→asc, rating→desc). `sortItems` takes `(items, sortBy, dir)`. The
  active button shows an arrow.
- **#8 hours** — the bug is in `attributes.js` `todayHours`, which returns the
  raw Yelp range string. Add a formatter that splits on `-`, zero-pads each
  `H:M` to `HH:MM`, and joins with an en dash. Keep returning `null` when
  unknown. `poi-popup.jsx` renders the formatted value.
- **#8 price/review** — `describeAttributes`/`poi-popup.jsx`: the price chip is
  labelled "Price $$"; the review count already flows via `poi.review_count` in
  `Stars` — confirm it appears in the row.

## Related Code Files

- Modify: `src/explorer/nearby-list.jsx` (direction toggle + arrow)
- Modify: `src/explorer/attributes.js` (`todayHours` zero-pad formatter; price
  label if done here)
- Modify: `src/explorer/poi-popup.jsx` (render padded hours; labelled price;
  ensure review count)
- Create: `src/explorer/nearby-list.test.jsx` (sort field + direction toggle)
- Modify: `src/explorer/attributes.test.js` (hours padding cases)
- Modify: `src/explorer/poi-popup.test.jsx` (padded hours + labelled price render)

## Implementation Steps

1. In `attributes.js`, add hours formatting: parse `"H:M-H:M"`, pad each side to
   `HH:MM`, join with `–`; return `null` on unknown/malformed. Keep `todayHours`
   returning the formatted string (or add a `formatHours` helper it calls).
2. In `poi-popup.jsx`, render the formatted hours; label price as "Price " + the
   `$` tier; confirm `review_count` shows next to stars.
3. In `nearby-list.jsx`, add `dir` state; update `sortItems` to honor field +
   direction; clicking the active field flips `dir`, clicking the other switches
   field to its default direction; show ↑/↓ on the active button.
4. Add `nearby-list.test.jsx`: assert order flips when the active sort is
   re-clicked, for both distance and rating.
5. Extend `attributes.test.js` with `"10:0-21:0"` → `"10:00–21:00"` and a
   malformed/empty → null case.
6. Extend `poi-popup.test.jsx` for padded hours + "Price $$".
7. Run vitest.

## Success Criteria

- [ ] Hours display as `10:00–21:00` (never `10:0`); unknown hours show nothing.
- [ ] Price shows as a labelled tier ("Price $$"); review count is visible.
- [ ] Re-clicking the active sort flips direction with an ↑/↓ indicator; both
      distance and rating toggle.
- [ ] `nearby-list.test.jsx` added and green; `attributes.test.js` /
      `poi-popup.test.jsx` updated and green; suites stay green.

## Risk Assessment

- **Risk:** Yelp hours edge cases (e.g. `"0:0-0:0"`, midnight-crossing, single
  digit both sides). *Signal:* padding test fails or shows `00:00–00:00` for a
  closed day. *Response:* pad purely lexically (split each side on `:`, pad each
  part to 2), do not interpret semantics; treat unpar. as `null`.
- **Risk:** Direction toggle interferes with the existing default-on-fresh-result
  behaviour. *Signal:* sort resets unexpectedly on new selection. *Response:*
  keep `sortBy`/`dir` local to `NearbyList`; do not lift into the app.
