---
title: "Co-located Spot Explorer"
description: "Second end-user app: a SEPARATE, clean Explorer frontend reusing the existing backend + C++ miner. User mines a city (standard job flow, user-set ε/threshold), then clicks a food/leisure POI to see its co-located neighbours grouped by type-cluster, each with distance + rating + attributes popup, filtered by a client-side discovery radius. Discovery framing, not next-POI prediction."
status: pending
priority: P1
effort: "2-3w"
tags: [poi, co-location, explorer, yelp, frontend, pipeline]
created: 2026-08-16
---

# Co-located Spot Explorer

## Overview

A second end-user app for `spatial_web`, built as a **separate, clean frontend**
(new package/folder) that **reuses the existing backend + C++ miner** and leaves the
Investor/Mining spatial_web frontend **completely untouched**. Flow: the user picks a
city dataset and runs a mine through the **standard job flow** (they set the distance ε
and threshold themselves — each run reflects their parameters), then on the map
**clicks a food/leisure POI** to see its **co-located neighbours grouped by the
type-clusters** the miner found (shown as a feature list, e.g. "Wine Bars + Tapas +
Gelato"), each neighbour showing **distance + rating + an attributes popup**, all
filtered by an **adjustable client-side discovery radius**. Co-location is the silent
ranking engine (no rare/WPI/κ jargon in the result view). Framing is **discovery**
("what's around this spot"), **never prediction** ("your next stop") — honouring the
committee's 11-08 decision to drop POI top-k recommendation. Full brainstorm:
`plans/reports/brainstorm-260816-1700-colocation-spot-explorer.md`.

## Decisions locked (deep validation, 2026-08-16)

- **App placement = separate clean frontend** (new folder), reusing the existing
  backend + engine. Not a top-switch inside the current spatial_web UI. The new app may
  reuse low-level utilities (CRS projection, Leaflet setup) as clean shared code, but
  carries none of the Investor/Mining component tree.
- **Job provisioning = standard job flow retained.** The Explorer keeps a dataset picker
  + mining controls (distance ε, threshold min_prev). The user triggers the mine; results
  depend on their parameters. No pre-mined artifact, no hidden mining. The *result view*
  stays jargon-free even though the *mining controls* are exposed.
- **Discovery = reuse click-a-POI** (`instance_recommendations`); NO new arbitrary-point
  `/explore` endpoint. The discovery radius is a **client-side view filter** on nearby
  POIs, never sent to the backend as `eps_m`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Lock a feature budget the C++ miner can actually run on a cuisine vocabulary | P1 |
| 2 | New extraction pipeline (in spatial_web): fine-grained cuisine, Philadelphia + New Orleans | P1 |
| 3 | Backend: register 2 city datasets + carry display attributes on `/instances` and `instance_recommendations` (reuse click-POI; NO new endpoint) | P1 |
| 4 | Frontend: a separate, clean Explorer app (dataset + mining controls, map, click-POI grouping, popup, client-side discovery radius) | P1 |
| 5 | Keep eval extensible (seam only, not built); tests + docs; guard the no-prediction boundary | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Runtime feasibility spike (feature budget lock)](./phase-01-start.md) | ✅ Done — locked ~20 feat / ε=100 / min_prev=0.2 ([results](./phase-01-feasibility-results.md)) |
| 2 | [Phase 2: New cuisine extraction pipeline](./phase-02-new-cuisine-extraction-pipeline.md) | ✅ Done — Phil+NOLA datasets built & mine-verified (κ 1.85 / 1.32) |
| 3 | [Phase 3: Backend datasets + attributes (reuse click-POI)](./phase-03-backend-datasets-discovery-radius-attributes.md) | Pending |
| 4 | [Phase 4: Separate clean Explorer app](./phase-04-frontend-explorer-mode.md) | Pending |
| 5 | [Phase 5: Extensibility seam, tests, docs](./phase-05-extensibility-seam-tests-docs.md) | Pending |

## Success Criteria

- [x] Miner runs on a cuisine dataset within an agreed time budget — **Phase 1 locked
      ~20 features/city, ε=100 m, min_prev=0.2** (Phil 107 s, NOLA 4 s; 25–30 features
      infeasible on Philadelphia).
- [x] Packaged Philadelphia + New Orleans cuisine datasets exist and mine into patterns
      through the standard job flow — **built & verified** (Phil 5724 inst/20 feat/κ1.85/63.7 s
      → 309 patterns incl. 27 quads; NOLA 2425/19/κ1.32/4.3 s).
- [ ] Explorer: pick a city → run a mine (user-set ε/threshold) → click a food/leisure POI
      → its co-located neighbours grouped by type-cluster, each with distance + rating;
      popup shows attributes present, missing = "unknown".
- [ ] Discovery radius is a client-side view filter and can never reach the backend as
      `eps_m` / trigger a re-mine.
- [ ] Explorer is a separate clean frontend; Investor/Mining spatial_web frontend
      unchanged; no endpoint implies next-POI prediction.
- [ ] Red-team + validation gates pass; whole-plan consistency clean.

## Constraints & Non-goals (inherited from brainstorm + locked decisions)

- Engine = existing C++ miner; no new engine; feature budget from Phase 1.
- Backend reused, not forked: extended only with the two cuisine datasets + attribute
  passthrough. No new arbitrary-point endpoint (click-POI reuse only).
- Two separate per-city datasets (distinct projection centres); business data only.
- Standard mining job flow retained; the user sets ε/threshold. The result *view* hides
  rare/WPI/κ jargon, but mining is not pre-baked or hidden.
- No `/api/recommend*` / `recommender.py` / B1..M1 revival; no personalization.
- Evaluation (baseline + ground-truth + metrics) is a deferred STRETCH — design the
  seam, do NOT build it; baseline not chosen.
- Cluster label = feature list only (no semantic/LLM names). "Group of types", not
  "district" (patterns are size 2-3). Naming feature is provisional per user.
- `attributes` display only, never fed to the miner.
- Discovery radius = client-side view filter only; distinct from mining ε.

<!-- slug: co-located-spot-explorer -->
