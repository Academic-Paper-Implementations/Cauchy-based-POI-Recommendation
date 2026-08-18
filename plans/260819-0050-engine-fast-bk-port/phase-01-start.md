---
title: "Phase 1: Port the clique core + preserve legacy"
status: todo
priority: P1
dependencies: []
---

# Phase 1: Port the clique core + preserve legacy

## Overview

Bring Cauchy's Fast-BK hybrid clique enumeration into the engine as the new
`maximal_clique_hashmap.cpp`, and preserve the current BK-Pivot implementation as
a separate `MaximalCliqueHashmapLegacy` class so Phase 2 can compare them. Get
both compiling.

## Requirements

- Functional
  - `server/engine/src/maximal_clique_hashmap.cpp` contains Cauchy's hybrid
    implementation (degeneracy ordering + BK-RCD + BK-Pivot switch), exposing the
    unchanged `MaximalCliqueHashmap::executeBK` / `extractInitialCandidates`.
  - The current BK-Pivot code is preserved verbatim as class
    `MaximalCliqueHashmapLegacy` in `server/engine/tests/maximal_clique_hashmap_legacy.{h,cpp}`.
  - The product miner still builds via the existing path (CMake target
    `colocation_miner`, and the README g++ one-liner).
- Non-functional
  - Ported clique `.cpp` is plain C++17 (no `<windows.h>`/psapi — those live only
    in Cauchy's *main.cpp*, which is NOT ported).
  - Header `maximal_clique_hashmap.h` unchanged. `types.h` unchanged.

## Architecture

`server/engine/CMakeLists.txt` globs `src/*.cpp` into `colocation_miner`. The
legacy class and the Phase-2 harness must live **outside** `src/` (put them in a
new `server/engine/tests/`) so the glob does not pull them into the product
binary or create a second `main`.

The legacy class is a rename-only copy of today's `maximal_clique_hashmap.cpp`:
same code, class renamed to `MaximalCliqueHashmapLegacy`, same method
signatures, so Phase 2 can instantiate both against one `NeighborSet` input.
Capture today's file from git (`git show HEAD:server/engine/src/maximal_clique_hashmap.cpp`)
before overwriting it, so the legacy copy is provably the shipped BK-Pivot.

The new file is Cauchy's `src/maximal_clique_hashmap.cpp` with the class name
kept as `MaximalCliqueHashmap` and its `#include`s pointed at the engine's
headers (`types.h`, `maximal_clique_hashmap.h`). Its private helpers stay in the
anonymous namespace inside the `.cpp` (no header edits).

## Related Code Files

- Modify: `server/engine/src/maximal_clique_hashmap.cpp` (replace body with the
  Fast-BK hybrid)
- Create: `server/engine/tests/maximal_clique_hashmap_legacy.h`
- Create: `server/engine/tests/maximal_clique_hashmap_legacy.cpp` (renamed copy
  of the pre-port `.cpp`)
- Modify: `server/engine/CMakeLists.txt` (leave the product target as-is; the new
  test target is added in Phase 2)
- Read-only source: `Cauchy-and-Fast-BK-algorithm/src/maximal_clique_hashmap.cpp`

## Implementation Steps

1. `git show HEAD:server/engine/src/maximal_clique_hashmap.cpp` → save as the
   legacy `.cpp`; add a matching `maximal_clique_hashmap_legacy.h` declaring
   `class MaximalCliqueHashmapLegacy` with the same two public methods; rename the
   class throughout the legacy file.
2. Copy Cauchy's `maximal_clique_hashmap.cpp` over
   `server/engine/src/maximal_clique_hashmap.cpp`; fix `#include` paths; strip any
   stray platform includes; keep the class name `MaximalCliqueHashmap` and the
   anonymous-namespace helpers.
3. Confirm no reference to `min_cond_prob` or Cauchy-only config leaked in; the
   file must depend only on `types.h` + the engine headers it already used.
4. Build the product miner (CMake Release and the README g++ one-liner) — it must
   compile with the new file and without the `tests/` dir.
5. Sanity smoke: run the miner on one small config to confirm it still emits
   `[stage]` lines and a JSON result (no behavioural assertions yet — that is
   Phase 2/3).

## Success Criteria

- [ ] New `maximal_clique_hashmap.cpp` = Fast-BK hybrid; header + `types.h` unchanged.
- [ ] Legacy BK-Pivot preserved as `MaximalCliqueHashmapLegacy` under `tests/`.
- [ ] `colocation_miner` builds via CMake and the g++ one-liner; a smoke run still
      prints `[stage]` and writes JSON.
- [ ] No `min_cond_prob` / Windows-only headers in the ported clique file.

## Risk Assessment

- **Risk:** include/type drift between the two repos breaks compilation. *Signal:*
  compile errors on `Colocation`/`NeighborSet`/instance pointer types. *Response:*
  the engine `types.h` is authoritative (unchanged); adapt the ported file's
  includes/usages to it, never the reverse.
- **Risk:** CMake GLOB compiles the legacy file into the product binary (duplicate
  symbols / bloat). *Signal:* link error or a second class in the miner.
  *Response:* keep legacy + harness strictly under `tests/`, outside the `src/*`
  glob.
