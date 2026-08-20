export const shouldRecenter = (bounds, center, currentZoom, targetZoom) =>
  !bounds.contains(center) || currentZoom < targetZoom;

export const euclidean = (a, b) =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

export const RADIUS_MAX_M = 1500;
