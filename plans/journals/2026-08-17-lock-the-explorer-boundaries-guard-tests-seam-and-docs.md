---
title: "Lock the explorer boundaries: guard tests, seam, and docs"
date: 2026-08-17
summary: Radius-never-mines guard + no-prediction tripwire + README/data docs; all five plan phases complete
---

# Lock the explorer boundaries: guard tests, seam, and docs

## What happened

Final phase of the co-located spot explorer plan: lock the boundaries that keep
the app honest, then document it.

Extracted the mining job body into a pure `miningRequest()` so the core invariant
is a real unit test rather than a grep: the discovery radius is a client-side view
filter, and the mine body it builds carries exactly dataset_id/eps_m/min_prev/
sample_pct with no radius anywhere, clamping a cleared or out-of-range field
instead of mining at zero. Added a tripwire test that reads every explorer source
file and fails the build on next-POI prediction wording ("next stop", "predict",
"your next", "forecast", "sẽ đến tiếp") — the framing stays discovery, not
prediction. The backend attribute-passthrough tests already landed in Phase 3.

Documented the app: a "Co-located Spot Explorer" section in the README (the
discovery-not-prediction framing, the search-distance vs discovery-radius
distinction, the two cuisine datasets, the clean evaluation seam, and the two-entry
layout) and the dataset regeneration command in server/data/README.md. The
extensibility seam is a documented discipline, not code: a future evaluation module
would read the same cached mine result the explorer reads, which carries no
explorer UI state — no EvalModule/metrics stub was built (baseline undecided).

Full suites green: pytest 76, vitest 48 (11 new explorer tests this phase across
the mining-request guard and the per-file no-prediction tripwire); lint clean.

## Decision

- The radius/eps guard is a pure-function unit test, not a source grep — the mine
  body structurally cannot contain the discovery radius, and the test proves it.
- Evaluation stays a documented seam, not a stub (YAGNI): the cached result is
  already decoupled from explorer UI state, so an eval module plugs in later
  without touching the explorer.

## Next steps

All five phases of the plan are complete (feasibility lock, cuisine extraction,
backend attributes, the separate explorer frontend, and this boundary/docs phase).
Optional follow-ups, none required: a live click-through of explorer.html for a
demo; wiring the Explorer's vitest into CI; and, only if the thesis wants it, the
deferred evaluation module against an as-yet-undecided baseline.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
