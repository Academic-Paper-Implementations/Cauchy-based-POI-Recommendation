import { describe, expect, it } from 'vitest';
import { shouldRecenter } from '../utils/map-helpers';

describe('shouldRecenter', () => {
  const makeBounds = (contains) => ({ contains: () => contains });

  it('returns true when point is off-screen', () => {
    expect(shouldRecenter(makeBounds(false), [0, 0], 17, 17)).toBe(true);
  });

  it('returns true when zoom is below target', () => {
    expect(shouldRecenter(makeBounds(true), [0, 0], 12, 17)).toBe(true);
  });

  it('returns false when point is on-screen and zoom is sufficient', () => {
    expect(shouldRecenter(makeBounds(true), [0, 0], 17, 17)).toBe(false);
    expect(shouldRecenter(makeBounds(true), [0, 0], 18, 17)).toBe(false);
  });
});
