---
title: Build cuisine co-location datasets for Philadelphia and New Orleans
date: 2026-08-16
summary: "Extraction pipeline + two packaged datasets, mine-verified; kappa replication matches engine exactly"
---

# Build cuisine co-location datasets for Philadelphia and New Orleans

## What happened

Implemented the production cuisine extraction pipeline
(`server/extract/build_cuisine_dataset.py`). It streams raw Yelp business data,
keeps food/leisure businesses per city, assigns each a single most-specific
cuisine label (lowest global count among an intentful ~20-feature vocabulary of
common cuisines plus the city's rare-signature cuisines), projects lat/lon to
metres via the shared `project_local`, and writes a packaged
`spatial_instances.csv` + `manifest.json` for Philadelphia and New Orleans, plus
display-only attribute columns (name, price, takeout, alcohol, wifi, ambience,
hours, ...) for the explorer popup.

Verified empirically: `datasets.prepare()` parses both; the real C++ miner
finishes at eps=100/min_prev=0.2 (Philadelphia 63.7 s, New Orleans 4.3 s) — the
intentful vocabulary is both faster AND richer than a plain top-20 (Philadelphia
309 patterns incl. 27 quads and a size-5, vs 95 triples before). The Python
kappa replicating the engine's `calculateDispersion` matches the miner's kappa to
nine decimals (Phil 1.851589683 > NOLA 1.320269731), confirming both the formula
and the single-label counts.

A code-reviewer pass returned no high-severity bug (correct on all
acceptance-critical paths). Fixed four low/medium latent findings it raised:
projection centre now computed after the floor re-filter; `Alcohol='none'`
(serves no alcohol) preserved instead of collapsed to unknown; vocabulary and
label tie-breaks given an explicit secondary key so they no longer depend on raw
file line order; manifest source path stored as posix. Rebuild after fixes is
byte-identical on coordinates and kappa.

## Decision

- Vocabulary locked at ~20 features/city with rare-signature cuisines guaranteed
  a slot (Cheesesteaks/Vietnamese/Soul Food/Korean for Philadelphia,
  Cajun-Creole/Southern for New Orleans). Floor >= 30 enforced on the actual
  single-label instance counts, not the global tag counts.
- The change is purely additive: no existing file was modified, so there is no
  regression surface in the existing miner/API path. The two datasets are not yet
  registered in `datasets.py` (that is the next phase).

## Next steps

- Register `philadelphia-cuisine` and `new-orleans` in `server/datasets.py`
  (ColumnMap feature=Feature, x=X, y=Y, latitude/longitude, identifier=business_id)
  and carry the display attributes through `_read_source` and the click-POI
  recommendation response.
- Frontend (later): filter to `is_open=1` for display so permanently-closed
  businesses do not surface to the end user.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
