# Engine provenance

The C++ co-location miner in this directory is vendored, not authored here.

| | |
|---|---|
| Upstream | `D:/01_learning/ai_ml/spatial_data_mining/Maximal-Clique-HashMap-Algorithm` (sequential build) |
| Commit | `bd8b73eddb01e195cbf7264b8017bfe225b040a0` — "edit something", 2026-02-23 |
| Vendored on | 2026-08-12 |
| Copied | `src/`, `include/`, `CMakeLists.txt` |
| Not copied | `data/`, `config/`, `out/`, `output/`, `tmp/` — the server supplies datasets and configs at run time |

`GP-parallel-processing` is a **different** experiment (TBB, parallel). It is not the
source of this code and must not be merged into it: the paper's measurements are for
the sequential algorithm, with no TBB dependency and no threading.

## Changes made after vendoring

1. **`src/utils.cpp` — paper formulas.**
   `calculateDispersion` now returns the Global Pairwise Dispersion as the mean of
   pairwise frequency ratios, `kappa = 2/(m(m-1)) * sum_{i<j} cnt(t_j)/cnt(t_i)`,
   replacing the RMS of pairwise log-count differences.
   `calcRareIntensity` now uses the Cauchy kernel on the within-pattern ratio
   `r = cnt(t)/cnt(t_min)`: `RI = 1 / (1 + ((r-1)/kappa)^2)`, replacing the Gaussian
   on log-count differences. A `MIN_INTENSITY` floor keeps the caller's reciprocal
   from collapsing to zero.

2. **`src/main.cpp` — rewritten driver.**
   Portable peak-memory probe (`report_writer.cpp`), stage markers on stdout, per-stage
   timings, configurable output paths, participation export, and non-zero exit on a
   missing config or dataset. The Windows-only `#pragma comment(lib, "psapi.lib")` and
   the unconditional `<windows.h>` include are gone.

3. **`include/miner.h`, `src/miner.cpp` — result carries its evidence.**
   `minePCPs` returns `std::vector<MinedPattern>` instead of `std::set<Colocation>`.
   The accepted set is unchanged; each pattern now also reports its WPI when one was
   computed and whether its membership rests on Lemma 2 (`deduced`). `queryInstances`
   became public so the driver can collect participating instances after mining.

4. **`include/types.h`, `src/data_loader.cpp` — instance numbers kept.**
   `SpatialInstance` gained `int number`, the numeric `Instance` column as read from
   the CSV. The loader previously folded it into the string id and discarded it; the
   server needs it to map results back to real records.

5. **`include/config.h`, `src/config.cpp` — no silent defaults.**
   Added `output_path` and `json_output_path` keys. `dataset_path` no longer defaults
   to `data/sample_data.csv`, and a missing config file now throws instead of running
   on defaults — silently mining the wrong dataset has bitten this project before.
   Keys and values are trimmed, and a leading UTF-8 BOM is stripped, so a config
   written by another tool cannot corrupt a path.

6. **`src/report_writer.cpp`, `include/report_writer.h` — new.**
   Peak-memory probe (`GetProcessMemoryInfo` on Windows, `VmHWM` from
   `/proc/self/status` elsewhere), the text report, and the JSON result. Both files are
   published through a temporary file and a rename, so a killed run leaves no
   half-written result.

7. **`CMakeLists.txt`** — target renamed to `colocation_miner`, `Release` default,
   resource-copy target dropped (there are no vendored resources to copy).

## Build

```
g++ -O2 -std=c++17 server/engine/src/*.cpp -Iserver/engine/include -o server/engine/bin/colocation_miner
```

## Verification fixture

Toronto `Toronto_x_y_alphabet_version_03.csv` (17,128 instances) at `neighbor_distance=120`,
`min_prevalence=0.2` must produce kappa = 7.8580 and 647 patterns with the size
distribution `{2:108, 3:214, 4:202, 5:97, 6:24, 7:2}`. Confirmed 2026-08-12 on this
vendored copy. The file lives in the sibling repo
`A-Joinless-Approach-for-Mining-Spatial-Colocation-Patterns/data/` and is deliberately
not copied here.
