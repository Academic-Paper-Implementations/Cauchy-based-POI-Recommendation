---
title: "Investor recommendation mode: two views over one mined result"
date: 2026-08-13
summary: Delivered all five plan phases; two defects surfaced only when the app was actually driven in a browser.
---

# Investor recommendation mode: two views over one mined result

## What happened

Executed the five-phase plan for Investor Recommendation Mode. All gates green:
eslint clean, 25 Vitest, 73 pytest, production build clean.

The backend work (`server/recommendation.py`) turned out cheaper than the plan
budgeted for. The plan sized the risk from a synthetic 2,000-pattern benchmark
at 355 ms; the real results have 175 patterns (Philadelphia, eps 80 m) and 647
(Toronto, eps 120 m), so measured p95 for site recommendations is 10 ms and
36 ms against a 500 ms criterion. Point recommendations are 2.6 and 5.2 ms
against 50 ms. The `wpi: null` branch that the plan spent real thought on is
dead on both real datasets — every pattern has a computed WPI — so it is
covered by unit test rather than by data.

Removing Plotly cut a 4,865 kB chunk: total JS 5,253 kB to 400 kB, production
build 32 s to 4.8 s.

## What only the browser caught

Two defects survived lint, unit tests, and a full pytest run, and appeared only
when the app was driven for real.

**Switching to the projected-only dataset rendered a blank grey map.** The
obvious suspect was the new `L.CRS.Simple` branch — the plan itself flagged
zoom/bounds tuning at 64 km extent as Phase 2's main risk. It was not that. The
region focused earlier in Philadelphia survived the dataset switch, and its
bounding box in Philadelphia metres re-framed the new map onto an empty corner
of Toronto's extent. The CRS code was correct the whole time; the state was
stale. Worth remembering that a plan's named risk is a hypothesis, not a
diagnosis — I nearly started tuning `minZoom` before checking the coordinates.

**A point selected in Investor view left Mining view blank.** Each view answers
a click through its own endpoint and neither fires while the other is closed,
which is what the plan asked for. Nobody wrote down what happens on the
transition between them.

## Decisions

An existing test, `test_no_poi_recommendation_endpoints_remain`, asserted that
no route path contains "recommend". It dated from the initial commit and guarded
against re-importing a sibling project's user-to-business recommender. The
endpoints this plan requires are a different thing and were an explicit user
decision, so the test was rewritten to state its real invariant — no
businesses/users routes, and every recommendation route must hang off a mining
job — rather than deleted.

Asked the user about UI language rather than guessing: the plan writes new
labels in Vietnamese while the existing UI is English. They chose the plan's
Vietnamese labels for the new panels, English elsewhere.

## Worth knowing

Peak ranking ties more often than the plan assumed. Region scores are sums over
a small pattern set, so many cells reach the same maximum: for Pizza on
Philadelphia the top three regions all peak at 2.68 and are ordered entirely by
total score. The peak column is still the right default, but on features with
few patterns it degenerates. Both columns are visible, so it reads honestly
rather than misleading.

## Next steps

- Tab through the form in a browser: focus rings were rewritten from inert
  `ring:` declarations to real `:focus-visible` outlines and verified by reading
  the CSS, not by eye.
- The region percentile threshold is fixed at 90, which yields large downtown
  blobs (top Pizza region spans 217 cells). That constant is the dial if a demo
  wants tighter areas.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
