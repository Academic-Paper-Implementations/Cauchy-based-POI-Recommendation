// The body for a city co-location search (the standard /api/jobs mine).
//
// A pure function on purpose: it makes the core invariant unit-testable — the
// discovery radius is a VIEW filter and is NEVER part of a mine. This takes only
// the search distance (eps) and the how-common threshold, never the view radius,
// and clamps them to the ranges the miner accepts so a cleared field cannot send
// eps_m=0 / min_prev=0.

export const EPS_MIN_M = 20;
export const EPS_MAX_M = 300;
export const MIN_PREV_MIN = 0.05;
export const MIN_PREV_MAX = 1;
export const DEFAULT_EPS_M = 100; // Phase-1 locked feasible budget for the cuisine datasets.
export const DEFAULT_MIN_PREV = 0.2;

const clamp = (value, lo, hi, fallback) => {
  const n = Number(value);
  // Number('') === 0; a cleared field must fall back, not mine at zero.
  if (!Number.isFinite(n) || n === 0) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

export function miningRequest({ datasetId, epsM, minPrev }) {
  return {
    dataset_id: datasetId,
    eps_m: clamp(epsM, EPS_MIN_M, EPS_MAX_M, DEFAULT_EPS_M),
    min_prev: clamp(minPrev, MIN_PREV_MIN, MIN_PREV_MAX, DEFAULT_MIN_PREV),
    sample_pct: 1.0,
  };
}
