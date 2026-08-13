// The one place the two coordinate systems differ.
//
// Datasets with lat/lon are drawn on web mercator; datasets carrying only
// projected coordinates are drawn on `L.CRS.Simple`, where one map unit is one
// metre of our own projection. Leaflet takes (lat, lng) in both cases, and under
// CRS.Simple the vertical axis is lat — so y comes first there, never x. Getting
// that order wrong mirrors the whole map about its diagonal, which looks
// plausible enough to ship, so every consumer goes through these two functions.

export const toLatLng = (crs, point) =>
  crs === 'xy' ? [point.y, point.x] : [point.lat, point.lon];

/** A recommended region's bounding box, which arrives in metres and — when the
 *  dataset has degrees — in degrees too, so neither CRS has to project. */
export const toBounds = (crs, bbox) =>
  crs === 'xy'
    ? [
        [bbox.y_min, bbox.x_min],
        [bbox.y_max, bbox.x_max],
      ]
    : [
        [bbox.lat_min, bbox.lon_min],
        [bbox.lat_max, bbox.lon_max],
      ];
