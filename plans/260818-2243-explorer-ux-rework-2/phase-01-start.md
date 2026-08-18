---
title: "Phase 1: Copy layer — English, cleanup, labels"
status: done
priority: P1
dependencies: []
---

# Phase 1: Copy layer — English, cleanup, labels

## Overview

One PR that replaces all Vietnamese copy in `src/explorer/` with English, adds
the team name, reworks the subtitle, removes a stale sentence, renames the
dataset labels, and updates every test that asserts on the changed strings.
Items #3, #1, #9, #11, #13. Grouped because they all edit the same string lines
in the same files — splitting them guarantees adjacent-line merge conflicts for
no benefit.

## Requirements

- Functional
  - #3 All user-facing strings in `src/explorer/` are English (headers, labels,
    buttons, stage labels, empty states, hints, popup words, attribute values).
  - #1 Header shows the app title plus an `AIP490-G13` tag beside it.
  - #11 Header subtitle reworded to: *"Pick a city and run the search, then
    click a place to see the types that cluster around it."*
  - #9 The sentence "Nhóm hình thành trong X m; đang hiện trong Y m" is removed
    from `discovery-radius-control.jsx`.
  - #13 Dataset labels in `server/datasets.py` drop "cuisine":
    "Philadelphia (co-location)", "New Orleans (co-location)".
  - #13-dep `isCuisineDataset` (`explorer-app.jsx:18`) is replaced with an
    explicit id allow-list so New Orleans still appears after the rename.
- Non-functional
  - `no-prediction-copy.test.js` passes **unmodified** (fix copy if it trips).
  - The eps/radius guard in `mining-request.test.js` passes unmodified.
  - No i18n framework — plain English string literals in place.

## Architecture

The Explorer already inlines its copy as literals (no dictionary). The English
pass is a literal-for-literal replacement plus the four test-fixture updates.
The attribute value maps in `attributes.js` (`BOOL('Mang đi', …)`, `ENUM('Rượu',
{ full_bar: 'đủ loại', … })`, `'Chưa đánh giá'`) are user-facing and are part of
#3; their assertions live in `attributes.test.js` / `poi-popup.test.jsx`.

`isCuisineDataset` currently: `/cuisine/i.test(dataset.label || dataset.id)`.
Replace with: `['philadelphia-cuisine', 'new-orleans'].includes(dataset.id)`.
This decouples the dropdown filter from the human label so #13 is safe.

## Related Code Files

- Modify: `src/explorer/explorer-app.jsx` (header title + `AIP490-G13`, subtitle,
  `isCuisineDataset` → id allow-list, empty-state/status strings)
- Modify: `src/explorer/city-mining-panel.jsx` (labels, buttons, `STAGE_LABELS`,
  cache hint)
- Modify: `src/explorer/discovery-radius-control.jsx` ("Quanh đây" label; remove
  the eps/radius sentence #9)
- Modify: `src/explorer/nearby-list.jsx` (section headings, sort labels, empty
  states, "Đang hiện N/M …")
- Modify: `src/explorer/poi-popup.jsx` (close aria-label, "Cách … m", "Hôm nay",
  co-location line, "Chưa đánh giá")
- Modify: `src/explorer/attributes.js` (BOOL/ENUM display strings)
- Modify: `server/datasets.py` (two label strings, lines ~186 and ~189)
- Modify: `src/explorer/attributes.test.js` (VN → EN assertions)
- Modify: `src/explorer/poi-popup.test.jsx` (VN → EN assertions)
- Modify: `src/explorer/city-mining-panel.test.jsx` (VN → EN assertions)
- Modify: `src/explorer/discovery-radius-control.test.jsx` (remove the sentence
  assertion #9; update label assertions)

## Implementation Steps

1. Translate `explorer-app.jsx`: title → e.g. "Co-located Spot Explorer", add an
   `AIP490-G13` tag element next to the `<h1>`, subtitle to the #11 string;
   translate the "Quanh {name}", "Nhấp vào một nơi…", "Đang tìm xung quanh…",
   and error/empty strings.
2. Replace `isCuisineDataset` with the explicit id allow-list.
3. Translate `city-mining-panel.jsx`: field labels ("Thành phố"→"City",
   "Khoảng cách (m)"→"Search distance (m)", "Độ phổ biến (0–1)"→"Popularity
   (0–1)"), the run/cancel button text, the `STAGE_LABELS` map, and the cache
   hint paragraph.
4. Edit `discovery-radius-control.jsx`: translate the "Quanh đây" label and
   **delete** the eps/radius `<p>` (#9).
5. Translate `nearby-list.jsx`: "Nơi đồng vị"→"Co-located places", "Nơi khác gần
   đây"→"Other nearby", sort labels ("Khoảng cách"/"Đánh giá"), empty states,
   and the "Đang hiện N/M — mở rộng bán kính" line.
6. Translate `poi-popup.jsx`: aria-label, "Cách … m"→"… m away", "Hôm nay"→
   "Today", the co-location line ("Thuộc N nhóm đồng vị" / "Đồng vị với …"),
   "Chưa đánh giá"→"No rating yet". (Row-format bug fixes are Phase 3 — keep this
   to translation.)
7. Translate `attributes.js` value strings (Mang đi/Giao hàng/Ngồi ngoài trời/
   Phù hợp trẻ em, Rượu/WiFi enums).
8. Edit `server/datasets.py` labels: drop "cuisine" from both cuisine datasets.
9. Update the four test files' assertions to the new English strings; delete the
   #9 sentence assertion in `discovery-radius-control.test.jsx`.
10. Run vitest for `src/explorer/`; if `no-prediction-copy.test.js` trips, fix
    the offending English copy, not the test.

## Success Criteria

- [ ] No Vietnamese remains in any non-test `src/explorer/` file (spot-check by
      grep for common diacritics).
- [ ] Header renders title + `AIP490-G13`; subtitle is the #11 English line.
- [ ] The eps/radius sentence is gone from the radius control.
- [ ] City dropdown still lists **both** Philadelphia and New Orleans.
- [ ] `server/datasets.py` labels read "… (co-location)" with no "cuisine".
- [ ] `no-prediction-copy.test.js` + `mining-request.test.js` guard pass unmodified.
- [ ] All four updated test files pass; full vitest + pytest suites green.

## Risk Assessment

- **Risk:** #13 label change silently drops New Orleans (id has no "cuisine").
  *Signal:* NOLA missing from dropdown. *Response:* step 2 allow-list — verified
  by the dropdown success criterion; do not merge without it.
- **Risk:** New English copy trips the no-prediction guard. *Signal:* that test
  fails. *Response:* fix copy (avoid predict/next/forecast/your next), never the
  test.
- **Risk:** A VN string missed in a less-obvious spot (aria-label, title attr,
  empty state). *Signal:* leftover diacritics on grep. *Response:* grep sweep in
  step-1 close-out before running tests.
