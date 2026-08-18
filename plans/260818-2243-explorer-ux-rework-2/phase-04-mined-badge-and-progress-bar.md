---
title: "Phase 4: Mined badge & staged progress"
status: done
priority: P2
dependencies: [1, 2]
---

# Phase 4: Mined badge & staged progress

## Overview

Make the mining panel self-explanatory. #6: replace the text-only stage line
with an honest staged progress bar (real 5-stage fraction) + a success banner on
done, dropping the `…`. #7: after a mine, show a badge naming what was mined and
how many groups were found. Both live in `city-mining-panel.jsx`, read data the
backend already serves, and need no backend change.

## Requirements

- Functional
  - #6 While running, a progress bar fills across the five real **work** stages
    (`load → neighbor_graph → maximal_clique → mining → export`) with the current
    stage label and elapsed seconds. No `…` ellipsis; no fabricated continuous %.
    NOTE the served `STAGES` array has **six** entries — the five work stages
    plus a terminal `"done"` (`server/mining_job.py:45`), so `stage_count` is 6
    and, while `status === 'running'`, `stage_index` maxes at 4 (`export`). Use
    the work-stage count as the denominator (see Architecture), not the raw
    `stage_count`, or the bar caps at ~83%.
  - #6 On `done`, an inline success banner appears (e.g. "✓ Done — N groups
    found"). No toast library.
  - #7 After a successful mine, a mined-state badge shows the mined city, ε, and
    popularity, plus the group count — e.g. "Mined: Philadelphia · ε 100 m ·
    popularity 0.2 → 37 groups". Replaces relying on the button flipping to
    "Search again" as the only signal (the button text stays, the badge adds
    clarity).
- Non-functional
  - Values come from `job.params` (ε, min_prev), the selected city label, and
    `result.pattern_count`. No new API calls, no backend edits.
  - Bar is accessible (`role="progressbar"`, `aria-valuenow/min/max`).

## Architecture

`city-mining-panel.jsx` already receives `job`, `result` (via `hasResult`), and
`running`. Extend its props to pass the needed values (or pass `result` and the
resolved city label) from `explorer-app.jsx`:

- Progress fraction: the served `STAGES` includes a terminal `"done"`
  (6 entries), so derive the **work-stage** denominator as `stage_count - 1`
  (= 5) and compute `fraction = clamp((stage_index + 1) / (stage_count - 1), 0, 1)`
  — `load` shows 20%, `export` shows 100%, and `done` hands off to the success
  banner. Guard `stage_count > 1` to avoid divide-by-zero/NaN. Render a bar + the
  existing `STAGE_LABELS[job.stage]` (now English from Phase 1) + elapsed.
- Success banner: shown when `job.status === 'done'` (or `hasResult` && !running)
  with `result.pattern_count`.
- Badge: shown when a result exists; reads `job.params.eps_m`,
  `job.params.min_prev`, the city label, and `result.pattern_count`
  (`server/main.py:236`).

`explorer-app.jsx` must thread `result.pattern_count` and the city label into
the panel. Confirm the `result` object in scope carries `pattern_count`
(`use-mining-job` result) before wiring — plan assumes yes (verified in
`server/main.py`), fall back to `job` fields if the hook reshapes it.

## Related Code Files

- Modify: `src/explorer/city-mining-panel.jsx` (progress bar, success banner,
  mined badge; new props)
- Modify: `src/explorer/explorer-app.jsx` (pass `result`/pattern count + city
  label to the panel)
- Modify: `src/explorer/city-mining-panel.test.jsx` (bar fraction from
  stage_index/stage_count; badge text; success banner on done)

## Implementation Steps

1. Confirm the shape of `result` from `use-mining-job` includes `pattern_count`;
   if the hook strips it, read the count from where the result is assembled and
   thread it through (no backend change).
2. In `explorer-app.jsx`, pass the mined group count and the selected city's
   human label into `CityMiningPanel`.
3. In `city-mining-panel.jsx`, replace the running `<p>` stage line with a
   `role="progressbar"` bar whose width = `(stage_index + 1) / (stage_count - 1)`
   clamped to [0,1] (work-stage denominator; see Architecture), plus the English
   stage label + elapsed seconds.
4. Add the success banner on `done` with the group count.
5. Add the mined-state badge (city · ε · popularity → N groups) shown whenever a
   result exists.
6. Update `city-mining-panel.test.jsx`: mock `job` with the **real 6-entry
   `STAGES` shape** (`stage_count: 6`, `stage_index: 4` for `export`) and assert
   the bar reads 100% at `export` (proves the work-stage denominator, not the
   raw `stage_count`, is used); also assert a mid-stage value and the badge +
   banner text. Do NOT mock `stage_count: 5` — that would hide the 5-vs-6
   mismatch.
7. Run vitest.

## Success Criteria

- [ ] Running a mine shows a bar advancing through the five stages with the stage
      label and elapsed time; no `…`.
- [ ] On completion, a success banner names the group count.
- [ ] A mined-state badge shows city, ε, popularity, and group count.
- [ ] No new API calls or backend changes; `city-mining-panel.test.jsx` updated
      and green; suites stay green.

## Risk Assessment

- **Risk (kongming, medium-confidence):** `result` from `use-mining-job` may not
  surface `pattern_count`. *Signal:* badge count is `undefined`. *Response:*
  step 1 verifies the hook's result shape first; if absent, read the count at the
  assembly point — still no backend/endpoint change (`server/main.py:236`
  already returns it).
- **Risk (kongming):** the served `STAGES` has 6 entries incl. `"done"`, so a
  naive `stage_index/stage_count` caps at ~83% while running and the "5 stages"
  framing misleads the implementer. *Signal:* bar never fills during a real mine,
  or a test mocks `stage_count: 5` and passes while prod caps at 83%. *Response:*
  work-stage denominator `stage_count - 1` (Architecture); test mocks the real
  6-entry shape (step 6).
- **Risk:** `stage_count` zero/undefined mid-transition causes NaN width.
  *Signal:* bar jumps or React warns. *Response:* guard `stage_count > 1`; clamp
  the fraction to [0,1].
- **Risk:** Stage labels regress to Vietnamese if Phase 1 order slips. *Signal:*
  mixed-language bar. *Response:* Phase 4 depends on Phase 1; author labels once.
