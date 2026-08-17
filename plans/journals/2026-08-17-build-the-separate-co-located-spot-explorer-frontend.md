---
title: Build the separate co-located spot explorer frontend
date: 2026-08-17
summary: "Standalone Vite entry reusing the backend + map utils; click-POI grouping, popup, view-only radius; 37 tests green"
---

# Build the separate co-located spot explorer frontend

## What happened

Built the end-user Explorer as a separate, clean frontend: its own Vite entry
(explorer.html -> src/explorer/) with an independent component tree, reusing only
the low-level utilities — LeafletMap, the use-mining-job hook, the api client,
crs, and feature-colors — and none of the Investor/Mining components. The
research app (index.html) is untouched; vite.config.js gains a second build
entry.

Flow: pick a cuisine city, run the standard mining job with a plainly labelled
"search distance" (eps) and "how common" (min_prev), then click a place on the
map to fetch its co-location groups via query_instance. Groups render as plain
feature lists (jargon hidden), each member with distance + rating; a popup shows
only the attributes that are known (a missing attribute is never rendered as
"No"); a discovery-radius slider filters the view client-side, clamped to the
mined eps, with a caption stating both distances honestly. Permanently-closed
places (is_open=0) are hidden.

A key scouting correction from Phase 3 carried through: the click-POI source is
query_instance (grouped neighbours with distance_m), not instance_recommendations
(feature-level counts). Verified the frontend data contract live via TestClient
(both cuisine cities filter correctly; instances carry name/stars/attributes;
3566/5724 Philadelphia places displayable after the is_open filter).

A code-reviewer pass confirmed all seven acceptance criteria and found no
blocking defect. Fixed four of its findings: exclude the clicked place from its
own co-located group (query_instance returns the origin as a distance-0 member);
clamp eps/min_prev on submit so a cleared field cannot send 0 to the miner;
remove a dead prop; and distinguish the two empty states ("not in any group"
vs "widen the radius"). Left one latent low (feature-set join key) as safe for
maximal cliques.

## Decision

- Separate Vite entry, not a separate repo/package: own HTML page and component
  tree (clean isolation) while sharing build tooling and the proven map/CRS/api
  utilities (DRY). The research app imports nothing from the explorer and vice
  versa beyond shared utilities.
- The discovery radius is a pure client-side view filter clamped to the mined
  eps; it is never sent to createJob and never re-mines. The legend reads the
  actual job eps_m, so the "co-location within X m" claim stays honest.

## Next steps

- Phase 5: extensibility seam note; a guard test that no explorer surface uses
  prediction wording; README + data-README docs for the app, the two datasets,
  and the discovery-vs-prediction framing; run the full suite (pytest + vitest).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
