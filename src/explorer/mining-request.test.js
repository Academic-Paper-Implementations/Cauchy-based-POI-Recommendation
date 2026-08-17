import { describe, it, expect } from 'vitest';
import { miningRequest, DEFAULT_EPS_M, DEFAULT_MIN_PREV } from './mining-request';

describe('miningRequest (the discovery radius never reaches a mine)', () => {
  it('builds the job body from the search distance and threshold only', () => {
    expect(miningRequest({ datasetId: 'philadelphia-cuisine', epsM: 100, minPrev: 0.2 })).toEqual({
      dataset_id: 'philadelphia-cuisine',
      eps_m: 100,
      min_prev: 0.2,
      sample_pct: 1.0,
    });
  });

  it('carries no discovery-radius key — exactly the four mining keys', () => {
    const req = miningRequest({ datasetId: 'x', epsM: 100, minPrev: 0.2 });
    expect(Object.keys(req).sort()).toEqual(['dataset_id', 'eps_m', 'min_prev', 'sample_pct']);
    expect('radius' in req).toBe(false);
    expect('radius_m' in req).toBe(false);
    expect('radiusM' in req).toBe(false);
  });

  it('clamps a cleared or out-of-range value instead of sending 0', () => {
    expect(miningRequest({ datasetId: 'x', epsM: 0, minPrev: 0.2 }).eps_m).toBe(DEFAULT_EPS_M);
    expect(miningRequest({ datasetId: 'x', epsM: NaN, minPrev: 0.2 }).eps_m).toBe(DEFAULT_EPS_M);
    expect(miningRequest({ datasetId: 'x', epsM: 5000, minPrev: 0.2 }).eps_m).toBe(300);
    expect(miningRequest({ datasetId: 'x', epsM: 5, minPrev: 0.2 }).eps_m).toBe(20);
    expect(miningRequest({ datasetId: 'x', epsM: 100, minPrev: 0 }).min_prev).toBe(DEFAULT_MIN_PREV);
    expect(miningRequest({ datasetId: 'x', epsM: 100, minPrev: 9 }).min_prev).toBe(1);
  });
});
