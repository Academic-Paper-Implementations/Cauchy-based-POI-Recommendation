---
phase: 4
title: "Vietnamese localization"
status: done
priority: P2
effort: "1.5d"
dependencies: [1, 2, 3]
---

# Phase 4: Vietnamese localization

## Overview
Translate the whole Explorer UI to Vietnamese, simplifying research jargon
(rare/WPI/κ/co-location) into short plain terms. Done last, after Phases 1–3 have
finalized the copy. Issue 1.

## Requirements
- Functional: every user-facing English string in `src/explorer/` (and the
  Explorer-only bits it renders) is Vietnamese; complex terms get short plain
  glosses, not literal jargon.
- Non-functional: no i18n framework — hardcode Vietnamese directly (KISS, single
  locale). Keep the discovery (not prediction) framing; extend the copy guard.

## Architecture
- No i18n infra exists; every string is a literal across ~6 files. Translate in
  place. A tiny local glossary/comment block mapping jargon→plain VN is enough;
  do NOT add a locale switcher or a translation library.
- Files with user-facing strings:
  - `src/explorer/explorer-app.jsx` (header, section titles, status lines)
  - `src/explorer/city-mining-panel.jsx` (labels, button, `STAGE_LABELS`, hints, Phase-1 validation messages)
  - `src/explorer/discovery-radius-control.jsx` (label, caption)
  - `src/explorer/cluster-group-list.jsx` / new nearby list (tier headers, empty states, N/M cap line)
  - `src/explorer/poi-popup.jsx` (Unrated, "m away", "Today", relationship line)
  - `src/explorer/attributes.js` (`RENDERERS`/enum maps/`DAYS` — attribute labels)
- Jargon → plain VN (examples, refine during work): co-location group → "nhóm
  địa điểm hay đi cùng nhau"; search distance (ε) → "khoảng cách tìm"; how common
  (min_prev) → "độ phổ biến"; rare → keep hidden in Explorer (it already is).
- **Guard:** extend `no-prediction-copy.test.js` banned-pattern list with
  Vietnamese prediction phrasing beyond the existing `/sẽ đến tiếp/i`. The guard
  auto-scans `src/explorer/` (`no-prediction-copy.test.js:12-14`), so new files
  are covered; keep avoiding "gợi ý"/"đề xuất" (recommendation framing the guard
  doesn't catch) for the whole app, tier-2 included.

## Related Code Files
- Modify: all `src/explorer/*.jsx` + `src/explorer/attributes.js` (string translation)
- Modify: `src/explorer/no-prediction-copy.test.js` (extend banned VN phrases)
- Tests: existing `src/explorer/*.test.*` — update any assertions that match English copy

## Implementation Steps
1. Sweep each file; replace English strings with Vietnamese + short glosses.
2. Translate `attributes.js` label/enum/day maps.
3. Fold in any Phase-3 strings that were left English (should be none if Phase 3
   step 9 was followed — verify).
4. Extend the no-prediction guard with VN prediction phrasing.
5. Update tests asserting on English copy; run full vitest.

## Success Criteria
- [ ] No English user-facing strings remain in `src/explorer/`.
- [ ] Jargon rendered as short plain Vietnamese, not literal translation.
- [ ] `no-prediction-copy.test.js` passes with the extended banned list.
- [ ] Committee-facing screenshots are Vietnamese only.
- [ ] Full vitest + pytest suites green.

## Risk Assessment
- **Translating before copy is final** wastes work and risks drift. Mitigated by
  ordering: this phase runs last; Phase 3 already authored its own new strings in
  Vietnamese inline. Verify no late English slipped in before closing.
