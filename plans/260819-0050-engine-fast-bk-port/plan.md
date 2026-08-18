---
title: "Engine Fast-BK Port"
description: "Upgrade the web app's C++ co-location miner (server/engine/) from plain BK-Pivot to the Fast-BK hybrid clique enumeration (degeneracy + BK-RCD + pivot switch) from the sibling Cauchy-and-Fast-BK-algorithm repo. Cauchy kernel is already present; this adds only the faster clique core. Patterns must stay identical; runtime drops. WS1 of 3 (engine → reorg → thesis)."
status: pending
priority: P1
effort: "1-2d"
tags: [engine, cpp, performance, colocation, aip490]
created: 2026-08-19
---

# Engine Fast-BK Port

## Overview

The web app's mining backend calls a vendored C++ miner (`server/engine/`) whose
maximal-clique enumeration is plain **BK-Pivot** (`maximal_clique_hashmap.cpp`,
231 lines). The sibling repo
`D:/01_learning/ai_ml/spatial_data_mining/Cauchy-and-Fast-BK-algorithm` has a
**Fast-BK hybrid** version of the same file (461 lines): degeneracy ordering + a
per-subgraph switch (`threshold = 2.8·k − {4.5|8|11}`) that picks **BK-RCD**
(dense) or **BK-Pivot** (sparse). This plan brings that faster clique core into
the engine so the backend miner uses **both** the Cauchy rare-feature kernel
(already in `utils.cpp`) **and** Fast-BK, running identically but faster.

The delta is one file. kongming code-verified: the header needs **zero changes**
(Cauchy's `runBKPivot`/`runBKRcd`/`analyzeStructure`/`getDegeneracyOrdering` live
in an anonymous namespace *inside* the `.cpp`; `executeBK` /
`extractInitialCandidates` signatures are identical), `types.h` differs only by
an unused `.number` field the clique file never touches, and the whole
downstream pipeline is content-keyed → **immune to clique enumeration order**, so
identical maximal cliques guarantee identical patterns.

WS1 of 3 (engine → reorg → thesis). See roadmap memory `thesis-submission-roadmap`.

## Contract

- **Outcome** — `server/engine/` clique enumeration is the Fast-BK hybrid; the
  compiled `colocation_miner` runs faster (esp. the ε=150 m Philadelphia case
  that currently aborts >20 min) while producing **identical patterns**; backend
  and frontend untouched.
- **Constraints** — KISS. The only shipped source change is the content of
  `server/engine/src/maximal_clique_hashmap.cpp`. Do **not** touch `main.cpp`
  (report_writer / `[stage]` / JSON / config / exit-code), `miner.cpp`,
  `utils.cpp` (Cauchy kernel), `neighbor_graph.cpp`, `data_loader.cpp`, or
  `types.h`. Do **not** port `min_cond_prob` (association-rule config the backend
  never writes). No backend API/contract change. Existing pytest + vitest stay
  green.
- **Non-goals** — copying the whole Cauchy engine; re-adding an integration
  layer; association-rule output; touching the Python backend or the frontend;
  the repo reorg (WS2) and thesis (WS3) workstreams.
- **Acceptance** — the raw-clique differential test passes on all three fixtures
  + a synthetic graph (Phase 2); Toronto reproduces κ=7.8580 / 647 patterns and
  ε=150 m completes with a recorded speedup (Phase 3); the shipped binary is
  rebuilt from the new source; pytest + vitest green.

## Decisions locked (brainstorm + kongming code-verified, 2026-08-19)

- **Surgical, one-file port.** Replace the *body* of
  `maximal_clique_hashmap.cpp` with Cauchy's hybrid implementation. Header
  unchanged.
- **Keep the old implementation as an oracle.** Preserve the current BK-Pivot
  code as a separate class `MaximalCliqueHashmapLegacy` (own file) until the
  differential test passes — it is the only independent oracle for the raw clique
  set. Remove it only in Phase 3 after green.
- **The 647-pattern oracle is necessary but NOT sufficient.** Lemma-2 pruning in
  `miner.cpp` can mask a clique-enumeration bug, so the *primary* gate is raw
  `executeBK()` output equality, not the final pattern count.
- **Biggest risk is inside `runBKRcd`** (the `isClique` degree check + `isMaximal`
  vs-X test), not the threshold constants (those are speed-only).
- **Differential test is a new, permanent C++ harness** — the engine currently
  has none (only `CMakeLists.txt`).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Port the clique core + preserve legacy](./phase-01-start.md) | pending |
| 2 | [Differential test harness & raw-clique gate](./phase-02-differential-test-harness-and-raw-clique-gate.md) | pending |
| 3 | [End-to-end validation & cleanup](./phase-03-end-to-end-validation-and-cleanup.md) | pending |

## Architecture touchpoints

| Area | Files |
|------|-------|
| Clique enumeration (replace body) | `server/engine/src/maximal_clique_hashmap.cpp` |
| Header (unchanged) | `server/engine/include/maximal_clique_hashmap.h` |
| Legacy oracle (new, temporary) | `server/engine/tests/maximal_clique_hashmap_legacy.{h,cpp}` |
| Differential harness (new) | `server/engine/tests/diff_clique.cpp` |
| Build | `server/engine/CMakeLists.txt` (globs `src/*.cpp`; add a separate test target) |
| Source of the hybrid | `Cauchy-and-Fast-BK-algorithm/src/maximal_clique_hashmap.cpp` |
| Fixtures | base Philadelphia, Philadelphia-cuisine, New Orleans (under `server/data/`) + Toronto (NOT packaged — via `TORONTO_INSTANCES` / sibling repo) |
| Integration point (read-only) | `server/engine/src/main.cpp:104-106` |
| End-to-end oracle | app README numbers; `server/tests/` (pytest) |

## Success Criteria (roll-up)

- [ ] `maximal_clique_hashmap.cpp` holds the Fast-BK hybrid; header unchanged; the miner compiles via the existing CMake/g++ path.
- [ ] A `diff_clique` test target builds the new `MaximalCliqueHashmap` and `MaximalCliqueHashmapLegacy` together and asserts raw `executeBK()` output (Colocation keys + per-feature instance sets) is **exactly equal** on four real fixtures — Toronto, base Philadelphia (ε=80 m, the perf-critical dataset), Philadelphia-cuisine, New Orleans — and a tiny synthetic graph.
- [ ] Toronto ε=120 m / min_prev=0.2 end-to-end still gives κ=7.8580 and 647 patterns with sizes `{2:108,3:214,4:202,5:97,6:24,7:2}`.
- [ ] The ε=150 m Philadelphia mine completes (no >20 min abort); wall-clock before/after recorded.
- [ ] Legacy oracle removed only after the differential test is green; shipped binary rebuilt from the new source.
- [ ] `min_cond_prob` not introduced; no change to `main.cpp`/`miner.cpp`/`utils.cpp`/`neighbor_graph.cpp`/`data_loader.cpp`/`types.h`.
- [ ] pytest + vitest green.

## Risk Assessment

- **Soundness bug inside `runBKRcd`** (drops/duplicates maximal cliques
  silently). *Signal:* differential test finds a Colocation key or instance-set
  mismatch on a fixture or the synthetic graph. *Response:* fix the ported RCD
  (isClique/isMaximal) against the Legacy oracle; do not proceed to Phase 3 until
  raw equality holds.
- **Speedup doesn't materialize** (bottleneck was elsewhere, e.g. neighbor-graph
  build, not clique enumeration). *Signal:* ε=150 m still slow after the port.
  *Response:* profile the stage timings the miner already prints; report the true
  bottleneck. The port is still correct; adjust the runtime claim, do not chase
  scope not asked for.
- **CMake GLOB pulls the legacy/test files into the shipped miner.** *Signal:*
  `colocation_miner` gains an unused class or the build breaks on a second
  `main`. *Response:* place legacy + harness under `server/engine/tests/` (not
  `src/`), and give the harness its own `add_executable` target that excludes
  `src/main.cpp`; keep `src/*.cpp` glob for the product binary.
- **Windows-only code in the Cauchy file.** Cauchy's *main.cpp* uses
  `<windows.h>`/psapi, but that is NOT ported (we keep our own `main.cpp`); the
  clique `.cpp` itself must be plain C++17. *Signal:* compile error on a
  platform header. *Response:* strip any stray platform include from the ported
  clique file — it needs none.

## Open Questions

None — approach, file boundary, oracle strategy, and acceptance gates were
resolved in the brainstorm and kongming code-verified against both repos.

<!-- slug: engine-fast-bk-port -->
