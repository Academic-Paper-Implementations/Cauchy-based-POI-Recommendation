---
title: "Phase 3: End-to-end validation & cleanup"
status: todo
priority: P1
dependencies: [2]
---

# Phase 3: End-to-end validation & cleanup

## Overview

Prove the ported engine is correct and faster through the real backend, then
remove the temporary legacy oracle and rebuild the shipped binary. Only run once
the Phase-2 raw-clique gate is green.

## Requirements

- Functional
  - Toronto ε=120 m / min_prev=0.2 through the actual miner reproduces κ=7.8580
    and **647** patterns with sizes `{2:108,3:214,4:202,5:97,6:24,7:2}`.
  - The Philadelphia ε=150 m mine **completes** (previously aborted >20 min);
    record wall-clock before (BK-Pivot) vs after (Fast-BK).
  - The shipped `colocation_miner` binary is rebuilt from the new source
    (`server/engine/bin/colocation_miner.exe`).
  - The temporary legacy oracle + differential harness are either removed or kept
    only under `tests/` (not compiled into the product binary); if removed,
    confirm the legacy source remains recoverable from git history.
- Non-functional
  - `server/tests` (pytest) + `npm test` (vitest) pass unchanged.
  - `PROVENANCE.md` updated: note the clique enumeration was upgraded to the
    Fast-BK hybrid from the Cauchy-and-Fast-BK-algorithm repo (commit/date),
    keeping the paper's Cauchy kernel + WPI miner.

## Architecture

Validation goes through the normal job path, not the harness: run the miner with
a Toronto config (the pinned fixture) and check the JSON `pattern_count` + size
histogram + κ; run Philadelphia at ε=150 m and capture elapsed from the miner's
own per-stage timings. The README already documents the pre-port numbers
(ε=150 m aborts; Toronto 647 / κ=7.8580) — update the runtime table with the new
measured figure if it changes, but do **not** change the 647/κ pattern numbers
(they must be identical; if they are not, the port has a bug — return to Phase 2).

## Related Code Files

- Modify: `server/engine/PROVENANCE.md` (record the clique upgrade)
- Modify: `README.md` "Runtime, measured" table (new ε=150 m figure; only if it
  now completes — pattern numbers unchanged)
- Delete (or move fully under `tests/`): `server/engine/tests/maximal_clique_hashmap_legacy.{h,cpp}`
  and, optionally, keep `tests/diff_clique.cpp` as a permanent regression harness
- Rebuild: `server/engine/bin/colocation_miner.exe`

## Implementation Steps

1. Rebuild the miner from the new source (CMake Release / g++ one-liner) into
   `server/engine/bin/`.
2. Run Toronto ε=120 m / min_prev=0.2; assert JSON `pattern_count == 647`, the
   size histogram matches, and κ=7.8580. Any deviation → stop, return to Phase 2.
3. Run Philadelphia ε=150 m; confirm it completes; record elapsed (and the
   ε=80/100/120 m figures if convenient) vs the README's pre-port table.
4. Run `pytest server/tests` and `npm test`; both green (they exercise the JSON
   contract / job lifecycle, which is unchanged).
5. Decide legacy disposition: keep `diff_clique.cpp` as a permanent harness but
   remove/retire `MaximalCliqueHashmapLegacy` now that equivalence is proven
   (legacy stays in git history); ensure the product target still excludes
   `tests/`.
6. Update `PROVENANCE.md` and the README runtime table.

## Success Criteria

- [ ] Toronto reproduces κ=7.8580 and 647 patterns with the exact size histogram.
- [ ] Philadelphia ε=150 m completes; before/after wall-clock recorded.
- [ ] Shipped binary rebuilt from the new source; product build excludes `tests/`.
- [ ] pytest + vitest green.
- [ ] `PROVENANCE.md` records the clique upgrade; README runtime table updated
      (pattern numbers unchanged).
- [ ] Legacy oracle retired (recoverable from git); `min_cond_prob` never
      introduced.

## Risk Assessment

- **Risk:** Toronto pattern count/κ differs after the port. *Signal:* step 2
  assertion fails. *Response:* this means a real clique bug slipped past Phase 2 —
  do NOT accept new numbers; return to Phase 2, extend the differential/synthetic
  cases until the discrepancy is reproduced at the raw-clique level, and fix.
- **Risk:** ε=150 m still does not complete. *Signal:* step 3 hangs/aborts.
  *Response:* capture the miner's per-stage timings to locate the true bottleneck
  (clique vs neighbour-graph vs mining); report it. Correctness at ε=150 m is
  **not** independently verified here (no legacy oracle survives at that ε) — it
  rests on the Phase-2 raw-clique gate, which now includes base Philadelphia at
  ε=80 m; do not claim ε=150 m correctness beyond that, and do not expand scope to
  optimise a different stage without a new decision.
- **Risk:** removing the legacy files breaks the product build (CMake still
  references them). *Signal:* build error after deletion. *Response:* remove the
  `diff_clique`/legacy target references together with the files, or guard the
  test target behind an option; the `colocation_miner` target must build from
  `src/*.cpp` alone.
