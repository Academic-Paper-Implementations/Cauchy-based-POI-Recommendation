import L from 'leaflet';

// Base map that prefers the locally-downloaded tile pack and only reaches the
// network for tiles the pack is missing. The pack is produced by
// backend/scripts/download_tiles.py into frontend/public/tiles and served by
// Vite at /tiles/{z}/{x}/{y}.png.
//
// Why not a plain online TileLayer: some ISPs DNS-block openstreetmap.org, which
// leaves the map blank. The local pack removes that runtime dependency entirely;
// the online mirror is only a graceful fallback for out-of-pack tiles when a
// connection happens to be available (the .de domain is not the blocked one).

const LOCAL_URL = '/tiles/{z}/{x}/{y}.png';
const ONLINE_URL = 'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png';
const SUBDOMAINS = 'abc';

// The pack is downloaded up to this zoom; deeper levels are upsampled from it in
// the browser rather than fetched, so point-selection zoom still shows a map.
// Keep in sync with MAX_ZOOM in backend/scripts/download_tiles.py.
const PACK_MAX_ZOOM = 15;

const onlineUrl = ({ x, y, z }) =>
  ONLINE_URL.replace('{s}', SUBDOMAINS[(x + y) % SUBDOMAINS.length])
    .replace('{z}', z)
    .replace('{x}', x)
    .replace('{y}', y);

const OfflineTileLayer = L.TileLayer.extend({
  createTile(coords, done) {
    const tile = document.createElement('img');
    tile.alt = '';
    // A tile missing from the pack 404s locally; swap to the online mirror once,
    // then give up (Leaflet shows nothing for that tile rather than looping).
    let triedOnline = false;
    tile.addEventListener('load', () => done(null, tile));
    tile.addEventListener('error', () => {
      if (triedOnline) {
        done(new Error('tile unavailable'), tile);
        return;
      }
      triedOnline = true;
      tile.src = onlineUrl(coords);
    });
    tile.src = this.getTileUrl(coords);
    return tile;
  },
});

export function createBaseLayer() {
  return new OfflineTileLayer(LOCAL_URL, {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18,
    maxNativeZoom: PACK_MAX_ZOOM,
  });
}
