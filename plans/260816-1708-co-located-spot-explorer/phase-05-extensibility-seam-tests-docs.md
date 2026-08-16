---
phase: 5
title: "Extensibility seam, tests, docs"
status: pending
priority: P2
effort: "2-3d"
dependencies: [3, 4]
---

# Phase 5: Extensibility seam, tests, docs

## Overview
Lock the boundaries that keep the app honest and future-proof: keep the cached mine
result decoupled from Explorer UI state (so a future evaluation module can read it),
guard the no-prediction / view-only-radius invariants with tests, and document the app.
The evaluation module itself is NOT built (baseline undecided, deferred stretch).

## Requirements
- Extensibility seam (design, ~1 note + discipline, not a module): the cached job-result
  object (patterns, instances, params) an eval module would read stays free of Explorer UI
  state (selected POI, discovery radius, popup toggles) — those live in the Explorer
  frontend's component state only. No `EvalModule`/`metrics.py` stubs (YAGNI).
- Tests:
  - Backend: cuisine datasets register + `/instances` returns attributes (missing = null,
    never "No"); click-POI (`instance_recommendations`) response carries
    distance/rating/attributes; existing Investor/Mining tests stay green.
  - Frontend (Explorer app): discovery radius is a client-side filter and is **never**
    included in the `/api/jobs` (mining) request body as `eps_m` (assert the request
    payload); popup unknown-handling; CRS latlon (`toLatLng`); a text guard that no
    Explorer discovery surface uses prediction wording ("next stop", "predict", "sẽ đến
    tiếp").
- Docs: README section for the Explorer app (it is a separate frontend reusing the backend);
  the two cuisine datasets + how to regenerate; the discovery vs prediction framing; the ε
  (mining) vs discovery-radius (client-side view) distinction. Update `server/data/README.md`.

## Architecture
- Seam mirrors the existing precedent: `rare_labeling.py` derives a display layer from a raw
  mine result at request time; the Explorer's click-POI grouping follows the same shape.
  Document that an eval endpoint would be a sibling reading the same cached result — one
  sentence, no code.
- Guard test pattern: since the discovery radius is now client-side, the guard asserts the
  Explorer's mining request payload never carries the radius value as `eps_m`, plus a repo
  grep test for banned prediction phrases in Explorer components/copy.

## Related Code Files
- Create: extend `server/tests/test_datasets.py` (attributes) + `test_recommendation.py`
  (click-POI display fields); Explorer frontend tests (`explorer/**/*.test.jsx`): popup
  unknown-handling, radius-not-in-job-payload guard, no-prediction copy, CRS latlon
- Modify: `README.md`, `server/data/README.md`
- Reference: `server/rare_labeling.py` (seam precedent), existing `server/tests/`

## Implementation Steps
1. Write the seam note (design doc line) + confirm no Explorer UI state leaks into the
   cached mine result.
2. Backend tests: cuisine datasets + attributes null-handling + click-POI display fields;
   keep old green.
3. Frontend tests: radius-never-in-job-payload guard, popup unknown-handling, CRS latlon,
   no-prediction copy.
4. Docs: README Explorer section (separate app, reused backend); dataset regeneration;
   framing + ε/radius note.
5. Run full suite (pytest + vitest for both frontends); fix regressions, do not weaken tests.

## Success Criteria
- [ ] Cached mine result carries no Explorer UI state (a future eval reads it unchanged).
- [ ] Guard test fails if the discovery radius is sent as `eps_m` in a mining request, or if
      prediction wording appears in the Explorer.
- [ ] New + existing tests green (pytest + vitest); no weakened assertions.
- [ ] README + data README document the separate app, datasets, and the discovery/framing
      boundary.

## Risk Assessment
- **Risk:** over-building the seam into speculative abstraction (YAGNI). Signal: an
  `EvalModule`/empty `metrics.py` appears. Response: delete it; the seam is decoupling
  discipline + one doc line, nothing more.
- **Risk:** guard test for "prediction wording" is brittle/false-positive. Response: keep the
  banned-phrase list small and explicit; it is a tripwire, not a linter.
- **Risk:** a second frontend means a second test runner/CI target. Response: keep the
  Explorer app's vitest config self-contained; wire it into the existing test command so it
  is not forgotten.
