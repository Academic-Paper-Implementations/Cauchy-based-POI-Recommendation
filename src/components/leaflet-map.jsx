import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { featureColor } from '../utils/feature-colors';
import { toBounds, toLatLng } from '../utils/crs';

// One map for both kinds of dataset.
//
// Datasets with lat/lon get the usual web-mercator map with OSM tiles. Datasets
// that carry only projected coordinates get `L.CRS.Simple`, where one map unit
// is one metre of our own projection and there is nothing to put underneath — so
// no tile layer, and negative zoom levels, because at CRS.Simple zoom 0 one unit
// is one pixel and a city spans tens of thousands of them.
//
// Leaflet is driven directly rather than through react-leaflet: ~10k circle
// markers are created once and then only restyled, so highlighting a pattern
// does not rebuild the layer. `preferCanvas` keeps the DOM out of it.

const BASE_STYLE = { radius: 3, weight: 0, fillOpacity: 0.65 };
const DIMMED_STYLE = { radius: 2, weight: 0, fillOpacity: 0.12 };
const NEIGHBOR_STYLE = { radius: 6, weight: 1.5, color: '#ffffff', fillOpacity: 1 };
const SELECTED_STYLE = { radius: 9, weight: 2.5, color: '#ffffff', fillOpacity: 1 };

// Far enough out for `fitBounds` to frame a whole city at one-metre map units.
const SIMPLE_MIN_ZOOM = -12;
// Web-mercator zoom at which an epsilon of tens of metres is finally legible.
const LATLON_SELECTION_ZOOM = 17;

const key = (feature, number) => `${feature} ${number}`;

export default function LeafletMap({
  instances,
  colors,
  selected,
  neighbors,
  radiusM,
  onSelect,
  crs = 'latlon',
  regions,
  onRegionSelect,
  focusRegion,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const circleRef = useRef(null);
  const regionsRef = useRef(null);

  // Create the map once per CRS: Leaflet fixes the CRS at construction, so a
  // dataset of the other kind needs a new map rather than a reconfigured one.
  useEffect(() => {
    if (!containerRef.current) return undefined;
    const map =
      crs === 'xy'
        ? L.map(containerRef.current, {
            preferCanvas: true,
            crs: L.CRS.Simple,
            minZoom: SIMPLE_MIN_ZOOM,
          }).setView([0, 0], 0)
        : L.map(containerRef.current, { preferCanvas: true }).setView([39.9526, -75.1652], 12);

    if (crs !== 'xy') {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
    }

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = new Map();
      circleRef.current = null;
    };
  }, [crs]);

  // Rebuild markers when the dataset changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = new Map();
    if (!instances.length) return undefined;

    const layer = L.layerGroup().addTo(map);
    instances.forEach((instance) => {
      const marker = L.circleMarker(toLatLng(crs, instance), {
        ...BASE_STYLE,
        fillColor: featureColor(colors, instance.feature),
      });
      marker.bindTooltip(`${instance.feature} · ${instance.id}`, { direction: 'top' });
      marker.on('click', () => onSelect(instance));
      marker.addTo(layer);
      markersRef.current.set(key(instance.feature, instance.number), marker);
    });

    map.fitBounds(L.latLngBounds(instances.map((i) => toLatLng(crs, i))), {
      padding: [20, 20],
    });
    return () => layer.remove();
  }, [instances, colors, onSelect, crs]);

  // Restyle for the current selection instead of rebuilding the layer.
  useEffect(() => {
    const markers = markersRef.current;
    if (!markers.size) return;

    const neighborKeys = new Set((neighbors || []).map((n) => key(n.feature, n.number)));
    const selectedKey = selected ? key(selected.feature, selected.number) : null;
    const highlighting = Boolean(selectedKey);

    markers.forEach((marker, markerKey) => {
      if (markerKey === selectedKey) {
        marker.setStyle({ ...SELECTED_STYLE, fillColor: marker.options.fillColor });
        marker.bringToFront();
      } else if (neighborKeys.has(markerKey)) {
        marker.setStyle({ ...NEIGHBOR_STYLE, fillColor: marker.options.fillColor });
        marker.bringToFront();
      } else {
        marker.setStyle(highlighting ? DIMMED_STYLE : BASE_STYLE);
      }
    });
  }, [selected, neighbors]);

  // The epsilon circle around the selected instance.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }
    if (!selected || !radiusM) return;

    const center = toLatLng(crs, selected);
    // `L.circle` takes its radius in metres. Under CRS.Simple Leaflet reads it as
    // map units instead — and our map units are those same metres, so the same
    // number is correct in both systems.
    circleRef.current = L.circle(center, {
      radius: radiusM,
      color: '#38bdf8',
      weight: 1.5,
      dashArray: '6 6',
      fillOpacity: 0.05,
    }).addTo(map);

    // At the city-wide starting zoom an epsilon of tens of metres is smaller than
    // a pixel, so the circle and the highlighted neighbours would be invisible.
    // Move close enough for them to be legible, without pulling the view back if
    // the user has already zoomed in further. The web-mercator zoom scale means
    // nothing under CRS.Simple, so that branch derives the level from the circle
    // instead of reusing a constant.
    const closeEnough =
      crs === 'xy'
        ? map.getBoundsZoom(
            L.latLngBounds(
              [selected.y - radiusM * 2, selected.x - radiusM * 2],
              [selected.y + radiusM * 2, selected.x + radiusM * 2]
            )
          )
        : LATLON_SELECTION_ZOOM;
    map.setView(center, Math.max(map.getZoom(), closeEnough));
  }, [selected, radiusM, crs]);

  // Recommended regions, in their own layer group underneath the markers: the
  // instances are the evidence and must stay readable through the overlay.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    if (regionsRef.current) {
      regionsRef.current.remove();
      regionsRef.current = null;
    }
    if (!regions?.length) return undefined;

    const peak = Math.max(...regions.map((region) => region.peak_score));
    const layer = L.layerGroup().addTo(map);
    regions.forEach((region) => {
      const share = peak > 0 ? region.peak_score / peak : 0;
      const rectangle = L.rectangle(toBounds(crs, region.bbox), {
        color: '#f59e0b',
        weight: 1,
        // Even the weakest region has to stay visible, hence the floor.
        fillOpacity: 0.1 + 0.35 * share,
        fillColor: '#f59e0b',
      });
      rectangle.bindTooltip(`#${region.rank} · peak ${region.peak_score.toFixed(2)}`, {
        direction: 'top',
      });
      if (onRegionSelect) rectangle.on('click', () => onRegionSelect(region));
      rectangle.addTo(layer);
    });
    layer.eachLayer((rectangle) => rectangle.bringToBack());

    regionsRef.current = layer;
    return () => layer.remove();
  }, [regions, crs, onRegionSelect]);

  // Fly to a region the user picked from the list.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusRegion) return;
    map.fitBounds(L.latLngBounds(toBounds(crs, focusRegion.bbox)), { padding: [40, 40] });
  }, [focusRegion, crs]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full rounded-lg" />
      {!instances.length && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
          No instances to display.
        </div>
      )}
    </div>
  );
}
