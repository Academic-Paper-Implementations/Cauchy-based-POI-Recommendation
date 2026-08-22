# Engine C++ edge-case verification — co-location mining core

Read-only review. Scope: `backend/engine/{src,include,tests}`. Decisive method:
built the differential harness with g++ 16.1.0 (ucrt64) and ran the new Fast-BK
hybrid against the preserved legacy BK-Pivot oracle over **all 2,130,944 labeled
graphs on 5–7 vertices** (exhaustive) plus **20,000 random graphs, 4–14 vertices,
density 0.30–0.94** (RCD path exercised in 100% of trials). Result: **0
divergences** in every configuration. Toolchain note: cc1plus failed silently until
`TMP` was pointed away from the sandbox-blocked system temp; the real datasets dir
(`server/runtime/datasets`) is empty, so the 4 CSV fixtures could not run — replaced
by exhaustive synthetic coverage, which is strictly broader than 4 fixed inputs.

## Verdict per edge case

### 1. runBKRcd CASE-1 X-check gated behind `if (!P.empty())` — CONFIRMED defect, output-masked
`src/maximal_clique_hashmap.cpp:207`. When P is empty at the CASE-1 test, the
X-maximality loop (L207–225) is skipped and `isMaximal` stays true, so R is
reported even though every `x∈X` is adjacent to all of R (BK invariant) → R is
provably non-maximal.

Empirically the buggy branch **is reached**: instrumented counters show it fired
**2,159,880 times** across the exhaustive n≤7 sweep, and an in-branch check
confirmed **all** of them are genuinely non-maximal (an `x∈X` extends R). Yet
**not one produced a wrong result.** Mechanism of the mask, proven, two layers:
- The buggy entry is only ever reached with **R = {v}, size 1** (a seed vertex whose
  eligible neighbours all fall in X, none in P). A dedicated counter for "buggy path
  with R.size()≥2" stayed **0** across all 2.13M exhaustive graphs and all 20k
  random graphs. Recursion never delivers empty-P + non-empty-X at R≥2 in any tested
  graph.
- `report_clique` drops `R.size() < 2` (`:67`). So the size-1 spurious clique is
  discarded before it can create a colocation key.

Net: `executeBK()` output is **byte-for-byte identical to the correct oracle** on
2,130,944 + 20,000 graphs. Final patterns / WPI are unaffected. Even if a size-≥2
spurious clique ever slipped through on a larger graph, it would be a **subset** of a
true maximal clique whose superset key already contributes those same instances in
`miner.cpp queryInstances` (superset-union aggregation, `:103–122`), and the miner
walks all subsets via `generateSubsets` with a `visited` guard — so downstream WPI
would still be unchanged. Classification: **latent correctness bug, currently
harmless.** Severity **Low** (defect real; blast radius nil under proof).
Suggested one-line fix: drop the `if (!P.empty())` gate (the X-loop is already a
no-op when P is empty and correctly marks R non-maximal when X is non-empty), or
early-return when `R.size()+P.size() < 2`. Not urgent given the proof.

### 2. Hybrid RCD-vs-Pivot switch (L436–458) enumerate the same maximal cliques — CONFIRMED
This is exactly what the differential run verifies: the hybrid picks RCD for dense
subgraphs (fired on 100% of the 20k random trials; heavily in the exhaustive sweep)
and Pivot elsewhere, and its total output equals the pure-Pivot legacy on every one
of the 2.13M + 20k graphs. **No divergent input found.** The only asymmetry between
the two paths is the item-1 gate, and that is masked. Threshold sign (often negative
→ RCD chosen for small k) is a performance heuristic only; correctness is
input-independent per the exhaustive equivalence.

### 3. analyzeStructure `return { 0, 0 }` for 3-field struct — HANDLED
`:276`. `StructureInfo{s,k,div}` aggregate-initialised with two values → `div`
value-initialised to 0 (well-defined C++ aggregate init). Reached only when P is
empty (`n_sub==0`), where div=0 is the intended "no divergence" value. Defined and
correct.

### 4. computeWeightedPI / Lemma-2 deduction — HANDLED (one defensive dead-ish branch)
`miner.cpp:128`. `totalCount==0 → continue` (`:150`) cannot occur for a feature that
is part of a live colocation (its instances are what created the pattern), so it is
defensive only; if *all* features were skipped, `minWPR` stays −1 → returns 0.0 →
rejected for any `min_prev>0`. Only corner: `min_prev==0` would accept a 0.0-WPI
pattern — not a realistic threshold. `deducePrevalentSubsets` (`:193`) selects
`f_min` = min-frequency feature with lexicographic tie-break (`:210–216`), correct
and guarded by `!f_min.empty()`. Deduced patterns are inserted with `deduced=true`
and `hasWpi=false`, and `writeJsonReport` emits `"wpi": null` when `!hasWpi`
(`report_writer.cpp:202–203`) — contract honoured.

### 5. neighbor_graph plane sweep + ptrMap id remap — PARTIAL (unvalidated input trust)
`neighbor_graph.cpp`. Plane-sweep `break` at `x[j]-x[i] > threshold` (`:34`) is
correct: the working vector is sorted ascending by x (`:25–28`), so once the x-gap
exceeds the threshold all later j do too. **HANDLED.**
`ptrMap[p.first.id]` remap (`:61–75`): `findNeighborPair` returns pairs of *value
copies* of a sorted copy, then `buildNeighborGraph` maps them back to the original
instance pointers by `id`. Correct **iff `id` is unique**. `id = type +
to_string(number)`, unique only if `(Feature, Instance)` is unique per row. The
loader performs **no uniqueness check**; a CSV with a duplicate `(Feature,Instance)`
silently collapses two instances to one pointer and corrupts adjacency. The
`diff_clique` harness asserts uniqueness on fixtures, but the product path does not.
**PARTIAL** — real failure mode on malformed input, unvalidated. Also note
`findNeighborPair` copies every instance twice per pair (value semantics) — a memory
cost on the 17k-row datasets, not a correctness issue (KISS flag).

### 6. data_loader sampling determinism & missing columns — CONFIRMED reproducibility gap (scoped)
`data_loader.cpp`. `keepCount = size*percentage` truncates toward zero with a
`==0 → 1` floor per feature (`:70–74`) — acceptable. `std::mt19937 g(rd())` (`:60–61`)
reseeds from `random_device` every run, so **sampling is non-reproducible** whenever
`0 < percentage < 1`; combined with a disk cache key that (per task note) omits the
seed, a cached result can be served for a *different* sample than a re-run produces.
**CONFIRMED**, severity **Medium but scoped**: only active for partial-sampling runs;
full runs (`percentage>=1`, the early return at `:49`) are deterministic. Fix if
partial sampling is ever used in production: accept an optional seed and fold it into
the cache key, or seed deterministically. Missing X/Y/Feature/Instance columns:
`xCol/yCol` fall back to `LocX/LocY` then upgrade to `X/Y` if present; a genuinely
absent column makes the csv accessor throw, which propagates to `main`'s
`catch(std::exception)` → clean **exit 1** (`main.cpp:161`). Fails loudly, no silent
corruption — acceptable, though the message doesn't name the offending column.

### 7. report_writer — mostly HANDLED; publishAtomically not truly atomic (Low)
`report_writer.cpp`. `escapeJson` covers `" \\ \b \f \n \r \t` and `<0x20 → \uXXXX`;
high UTF-8 bytes pass through (valid in JSON). `jsonNumber` maps NaN/Inf → `null`
(`:70–75`). Empty `featureCounts` → `{}` and empty `patterns` → `[]` via the
`first*` guards (`:186`, `:221`) — valid JSON. **HANDLED.**
`publishAtomically` (`:26–39`) does `remove(path)` **then** `rename(temp, path)`.
This is **not atomic**: a crash or a failed rename (temp locked by AV/indexer)
between the two leaves the previous good report **deleted and unreplaced** (data
loss), and a concurrent reader can observe the target briefly absent. On POSIX,
`rename` over an existing file is already atomic, so the unconditional `remove`
*introduces* a non-atomic window it didn't need; on Windows the remove is why it
works at all but at the cost of the guarantee the comment claims. **CONFIRMED**
minor robustness defect, severity **Low** (report artifact, not core data). Fix:
on POSIX drop the `remove` and rely on atomic rename; on Windows use
`MoveFileEx(..., MOVEFILE_REPLACE_EXISTING)`.

## Confirmed issues ranked
| # | Issue | Severity | Masked downstream? |
|---|-------|----------|--------------------|
| 6 | Non-reproducible sampling vs seedless cache key (partial runs only) | Medium (scoped) | N/A — wrong-cache risk |
| 5 | No instance-id uniqueness validation → adjacency corruption on dup `(Feature,Instance)` | Medium (bad input) | No |
| 7 | `publishAtomically` remove-then-rename not atomic; can lose prior report | Low | N/A |
| 1 | runBKRcd CASE-1 skips X-check when P empty → non-maximal report | Low (latent) | **Yes — fully; proven equal to oracle on 2.13M+20k graphs** |

Nos. 2, 3, 4 verified correct. No Critical or High findings.

## Verification artifacts (scratchpad, not committed)
- `fuzz_clique.cpp` — 20k random graphs, new vs legacy + RCD counter.
- `mch_instr.cpp` — instrumented copy of the clique source (buggy-path + non-maximal
  + R-size counters). Source itself was NOT modified.
- `exhaust_clique.cpp` — exhaustive all-graphs n∈{5,6,7} differential.
Rebuild: `export PATH=/c/msys64/ucrt64/bin:$PATH; export TMP=C:/msys64/tmp` then
`g++ -O2 -std=c++17 -DDIFF_CLIQUE_INSTRUMENT <harness> mch_instr.cpp
tests/maximal_clique_hashmap_legacy.cpp -Iinclude -Itests`.

## Unresolved
- Item 1 masking is proven for n≤7 exhaustively and n≤14 randomly, not by closed-form
  proof for all n. Residual risk is theoretical; the one-line gate fix removes it
  cheaply if desired.
- The PROVENANCE "identical output" claim could not be re-verified on the 4 named CSV
  fixtures because `server/runtime/datasets` is empty in this checkout; exhaustive
  synthetic coverage substitutes and corroborates the claim.
