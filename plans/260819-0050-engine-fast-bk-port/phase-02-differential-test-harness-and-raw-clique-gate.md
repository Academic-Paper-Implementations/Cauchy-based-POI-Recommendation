---
title: "Phase 2: Differential test harness & raw-clique gate"
status: done
priority: P1
dependencies: [1]
---

# Phase 2: Differential test harness & raw-clique gate

## Overview

Build a standalone C++ harness that runs the new `MaximalCliqueHashmap` and the
`MaximalCliqueHashmapLegacy` oracle on identical inputs and asserts their raw
`executeBK()` output is exactly equal. This is the **primary correctness gate** —
it catches a clique-enumeration bug that the final 647-pattern count could mask.

## Requirements

- Functional
  - A `diff_clique` executable that, for each fixture: loads the CSV
    (`DataLoader`), builds the neighbour graph (`NeighborGraph`, same
    `neighbor_distance` used for that fixture), runs both enumerators on the same
    `std::vector<NeighborSet>`, and compares the two
    `std::map<Colocation, std::unordered_map<FeatureType, std::set<const SpatialInstance*>>>`
    results for **exact** equality: same Colocation keys, and for each key the
    same per-`FeatureType` sets of instances (compare by a stable instance
    identity — e.g. `.number`/coords — not raw pointer values, which differ per
    load).
  - Fixtures: Toronto (ε=120 m), **base Philadelphia (ε=80 m)**,
    Philadelphia-cuisine (ε=100 m), New Orleans (ε=100 m), plus one tiny
    hand-constructed synthetic graph whose maximal cliques are known by hand.
    **Base Philadelphia is mandatory, not optional:** it is the 9,928-instance
    dataset whose ε=150 m case motivates the port, and Phase 3 validates it only
    by "completes + wall-clock" (no legacy oracle survives at ε=150 m). ε=80 m is
    fast (~7.3 s, README) and has a documented 175-pattern oracle, so it gives the
    perf-critical dataset a raw-clique correctness check that the smaller fixtures
    cannot. **Path note:** Toronto is NOT packaged under `server/data/`; resolve
    it via `TORONTO_INSTANCES` → `server/data/toronto/Toronto_x_y_alphabet_version_03.csv`
    → sibling `../A-Joinless-Approach-for-Mining-Spatial-Colocation-Patterns/data/Toronto_x_y_alphabet_version_03.csv`
    (present locally; verify before running). Base Philadelphia
    (`server/data/philadelphia/spatial_instances.csv`), Philadelphia-cuisine, and
    New Orleans are under `server/data/`.
  - Non-zero exit + a readable diff (which Colocation/instance differs) on any
    mismatch; exit 0 only when all fixtures + synthetic match.
- Non-functional
  - Deterministic: sort before comparing; do not depend on map/pointer ordering.
  - Runs in CI-style from the command line; reasonably quick on the fixtures
    (Toronto/NOLA are small; Philadelphia at ε=100 m is the heavy one — if too
    slow, the synthetic + Toronto + NOLA are the fast must-pass core and
    Philadelphia is the thorough check).

## Architecture

New CMake target in `server/engine/CMakeLists.txt`:
`add_executable(diff_clique tests/diff_clique.cpp
tests/maximal_clique_hashmap_legacy.cpp src/maximal_clique_hashmap.cpp
src/neighbor_graph.cpp src/data_loader.cpp src/config.cpp src/utils.cpp)` —
i.e. the shared pipeline sources **excluding** `src/main.cpp` and
`src/report_writer.cpp` (the harness supplies its own `main`). Include both
`include/` and `tests/`.

Instance identity for comparison: `SpatialInstance.number` is the CSV row index
**within a feature type**, not globally unique (`id = type + number`, so "A1" and
"B1" both have `number=1`). The comparator is therefore scoped per Colocation →
per `FeatureType` → sorted `.number` set, which is correct. Load the CSV **once**
per fixture and pass the same instance vector to both enumerators so the
`(type, number)` identity is shared. **Hardening (kongming):** on load, assert no
two instances share the same `(type, number)` pair — a duplicate would collapse
two distinct instances into one key and could mask a real mismatch as a false
match.

The synthetic graph: build a small `std::vector<SpatialInstance>` + hand-wired
`NeighborSet`s (e.g. a 5–6 node graph with two overlapping triangles and an
isolated edge) whose maximal cliques are enumerable by hand, and assert both
implementations return exactly that set. This catches RCD edge cases the real
data may not exercise.

## Related Code Files

- Create: `server/engine/tests/diff_clique.cpp`
- Modify: `server/engine/CMakeLists.txt` (add the `diff_clique` target only; leave
  `colocation_miner` untouched)
- Uses: `server/engine/tests/maximal_clique_hashmap_legacy.{h,cpp}` (Phase 1),
  `src/maximal_clique_hashmap.cpp` (new), shared pipeline sources
- Fixtures: the three miner CSVs under `server/data/`

## Implementation Steps

1. Add the `diff_clique` CMake target (shared sources minus `main.cpp` /
   `report_writer.cpp`, plus the legacy `.cpp` and the harness).
2. Write `diff_clique.cpp`: a fixture list `{path, eps}`; for each, load →
   neighbour graph → run both `executeBK` → normalize each ResultMap into a
   comparable structure keyed by Colocation then by feature then by sorted
   instance `.number` → compare; print the first mismatch and set a failure flag.
3. Add the synthetic-graph case with hand-verified expected maximal cliques.
4. Build and run `diff_clique`; iterate on the Phase-1 ported file until every
   fixture + the synthetic case reports exact equality.
5. Record the run (which fixtures compared, pattern/clique counts) in the phase
   notes for the Phase-3 sign-off.

## Success Criteria

- [ ] `diff_clique` builds as its own target without disturbing `colocation_miner`.
- [ ] Raw `executeBK()` output is byte-for-byte equal (Colocation keys +
      per-feature instance sets) between new and legacy on **four real fixtures**
      — Toronto, base Philadelphia (ε=80 m), Philadelphia-cuisine, New Orleans —
      and the synthetic graph.
- [ ] `runBKRcd` is confirmed invoked at least once across the fixture set (a
      temporary debug counter, not shipped) — it is the named highest-risk path.
- [ ] The harness exits non-zero with a readable diff on any injected mismatch
      (sanity-check the comparator by temporarily perturbing one input).
- [ ] No change to product engine behaviour or the shipped binary in this phase.

## Risk Assessment

- **Risk:** comparing by raw pointer values gives false mismatches (addresses
  differ per run). *Signal:* "mismatch" on identical logical sets. *Response:*
  compare by stable instance identity (`.number`), and load each fixture once so
  both runs share the same instances.
- **Risk:** Philadelphia at ε=100 m makes the differential test slow. *Signal:*
  harness runs for minutes. *Response:* keep Toronto + NOLA + synthetic as the
  fast must-pass gate; run Philadelphia as a slower thorough pass (still required
  before Phase 3, but it need not block quick iteration).
- **Risk (kongming):** a real RCD soundness bug (isClique/isMaximal). *Signal:*
  the synthetic or a fixture mismatches. *Response:* this is exactly what the gate
  exists to catch — fix the ported `.cpp` against the legacy oracle before
  proceeding.
