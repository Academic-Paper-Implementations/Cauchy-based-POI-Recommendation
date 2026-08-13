import { describe, expect, it } from 'vitest';
import { toBounds, toLatLng } from './crs';

// The two CRS paths differ in exactly one place: how a record becomes a Leaflet
// LatLng. Getting the order wrong under CRS.Simple mirrors the whole map about
// the diagonal, which looks plausible enough to ship, so it is pinned here.

const POINT = { lat: 39.9526, lon: -75.1652, x: 1200.5, y: 34000.25 };

describe('coordinate adapter', () => {
  it('reads degrees for a dataset with lat/lon', () => {
    expect(toLatLng('latlon', POINT)).toEqual([39.9526, -75.1652]);
  });

  it('reads metres as (y, x) for a projected-only dataset', () => {
    // Leaflet takes (lat, lng), and under CRS.Simple lat is the vertical axis —
    // so y comes first, never x.
    expect(toLatLng('xy', POINT)).toEqual([34000.25, 1200.5]);
  });

  it('defaults to degrees when no CRS is given', () => {
    expect(toLatLng(undefined, POINT)).toEqual([39.9526, -75.1652]);
  });
});

describe('region bounds', () => {
  const bbox = {
    x_min: 1000,
    y_min: 0,
    x_max: 1300,
    y_max: 100,
    lat_min: 39.94,
    lon_min: -75.17,
    lat_max: 39.95,
    lon_max: -75.16,
  };

  it('uses the degrees corners on a lat/lon map', () => {
    expect(toBounds('latlon', bbox)).toEqual([
      [39.94, -75.17],
      [39.95, -75.16],
    ]);
  });

  it('uses the metre corners, y first, on a projected map', () => {
    expect(toBounds('xy', bbox)).toEqual([
      [0, 1000],
      [100, 1300],
    ]);
  });
});
