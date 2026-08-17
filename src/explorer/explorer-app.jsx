import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../config/api';
import { buildFeatureColors } from '../utils/feature-colors';
import { useMiningJob, RARE_MIN_COUNT, DEFAULT_RARE_PERCENTILE } from '../hooks/use-mining-job';
import LeafletMap from '../components/leaflet-map.jsx';
import CityMiningPanel from './city-mining-panel.jsx';
import NearbyList from './nearby-list.jsx';
import DiscoveryRadiusControl from './discovery-radius-control.jsx';
import PoiPopup from './poi-popup.jsx';
import { miningRequest, DEFAULT_EPS_M, DEFAULT_MIN_PREV } from './mining-request';
import { euclidean, RADIUS_MAX_M } from '../utils/map-helpers';

const TIER2_CAP = 20;

const RARE = { rarePercentile: DEFAULT_RARE_PERCENTILE, rareMinCount: RARE_MIN_COUNT };

// Only the cuisine datasets carry the names/attributes the explorer needs.
const isCuisineDataset = (dataset) => /cuisine/i.test(dataset.label || dataset.id);

export default function ExplorerApp() {
  const [datasets, setDatasets] = useState([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [epsM, setEpsM] = useState(DEFAULT_EPS_M);
  const [minPrev, setMinPrev] = useState(DEFAULT_MIN_PREV);

  const [instances, setInstances] = useState([]);
  const [selected, setSelected] = useState(null); // the clicked origin place
  const [detail, setDetail] = useState(null); // query_instance response for `selected`
  const [popupPoi, setPopupPoi] = useState(null);
  const [radiusM, setRadiusM] = useState(DEFAULT_EPS_M);
  const [radiusJobId, setRadiusJobId] = useState(null);
  const [detailError, setDetailError] = useState('');

  const { job, jobError, result, running, run, reset, cancel } = useMiningJob();
  const instancesCacheRef = useRef(new Map());
  const detailAbortRef = useRef(null);
  const recenterRef = useRef(null);

  // The neighbour distance the current result was actually mined at — the hard
  // ceiling for the discovery radius (groups cannot exist beyond it).
  const minedEps = job?.params?.eps_m ?? epsM;

  // When a fresh result lands, open the discovery radius to the mined distance.
  // Done during render (the "reset state on input change" pattern React suggests)
  // rather than in an effect, so there is no cascading re-render.
  if (result && job?.job_id && job.job_id !== radiusJobId) {
    setRadiusJobId(job.job_id);
    setRadiusM(minedEps);
  }

  useEffect(() => {
    api
      .datasets()
      .then((body) => setDatasets((body.datasets || []).filter(isCuisineDataset)))
      .catch(() => setDatasets([]));
  }, []);

  const clearSelection = useCallback(() => {
    detailAbortRef.current?.abort();
    setSelected(null);
    setDetail(null);
    setPopupPoi(null);
    setDetailError('');
  }, []);

  const handleSelectCity = useCallback(
    async (city) => {
      // Cancel any in-flight mine (server DELETE) before resetting local state.
      if (running) await cancel();
      setSelectedCity(city);
      reset();
      clearSelection();
      if (!city) {
        setInstances([]);
        return;
      }
      // Restore from cache if available; otherwise fetch and populate.
      const cached = instancesCacheRef.current.get(city);
      if (cached) {
        setInstances(cached);
        return;
      }
      setInstances([]);
      try {
        const body = await api.instances(city);
        // is_open === "0" is a permanently-closed business — not worth showing.
        const filtered = (body.instances || []).filter((i) => i.attributes?.is_open !== '0');
        instancesCacheRef.current.set(city, filtered);
        setInstances(filtered);
      } catch {
        setInstances([]);
      }
    },
    [running, cancel, reset, clearSelection]
  );

  const handleRun = useCallback(() => {
    clearSelection();
    // miningRequest carries only the search distance + threshold (clamped), never
    // the discovery radius — the radius is a view filter and must not reach a mine.
    run(miningRequest({ datasetId: selectedCity, epsM, minPrev }));
  }, [run, selectedCity, epsM, minPrev, clearSelection]);

  const colors = useMemo(
    () => buildFeatureColors(instances.map((i) => i.feature)),
    [instances]
  );

  // Click a place on the map: fetch the co-location groups it takes part in.
  // Re-clicking the same place toggles the selection off.
  const handlePoiClick = useCallback(
    (poi) => {
      if (selected && poi.id === selected.id) {
        clearSelection();
        return;
      }
      setPopupPoi(poi);
      if (!job || job.status !== 'done') return;
      setSelected(poi);
      setDetailError('');
      detailAbortRef.current?.abort();
      const controller = new AbortController();
      detailAbortRef.current = controller;
      api
        .instancePatterns(job.job_id, poi.feature, poi.number, RARE, { signal: controller.signal })
        .then((body) => setDetail(body))
        .catch((error) => {
          if (error.name !== 'AbortError') setDetailError(error.message);
        });
    },
    [job, selected, clearSelection]
  );

  // Tier-1: co-located places (mined patterns). Flattened and deduped by id.
  // Each member carries the pattern features it belongs to (for the popup line).
  // Tier-1 is always bounded by minedEps, regardless of the slider.
  const tier1 = useMemo(() => {
    if (!detail?.patterns) return [];
    const originId = detail.instance?.id;
    const effectiveRadius = Math.min(radiusM, minedEps);
    const byId = new Map();
    for (const pattern of detail.patterns) {
      for (const n of pattern.neighbors || []) {
        if (n.id === originId || n.distance_m > effectiveRadius) continue;
        const existing = byId.get(n.id);
        if (existing) {
          existing.patternCount += 1;
        } else {
          byId.set(n.id, { ...n, patternFeatures: pattern.features, patternCount: 1 });
        }
      }
    }
    return [...byId.values()].sort((a, b) => a.distance_m - b.distance_m);
  }, [detail, radiusM, minedEps]);

  // Tier-2: other nearby places (not in tier-1), computed client-side.
  // Uses Euclidean distance on projected x/y, matches backend metric.
  const tier2 = useMemo(() => {
    if (!selected || !instances.length) return { items: [], total: 0 };
    const tier1Ids = new Set(tier1.map((p) => p.id));
    const origin = { x: selected.x, y: selected.y };
    const nearby = instances
      .filter((i) => i.id !== selected.id && !tier1Ids.has(i.id))
      .map((i) => ({ ...i, distance_m: euclidean(origin, i) }))
      .filter((i) => i.distance_m <= radiusM)
      .sort((a, b) => a.distance_m - b.distance_m);
    return { items: nearby.slice(0, TIER2_CAP), total: nearby.length };
  }, [selected, instances, tier1, radiusM]);

  // Everything highlighted on the map = tier-1 members.
  const mapNeighbors = tier1;

  const ready = job?.status === 'done';

  const handleRecenterReady = useCallback((fn) => {
    recenterRef.current = fn;
  }, []);

  return (
    <div className="flex h-screen flex-col bg-slate-900 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-3">
        <h1 className="text-lg font-semibold">Khám phá địa điểm đồng vị</h1>
        <p className="text-sm text-slate-400">
          Chọn thành phố, nhấp vào một nơi để xem các loại hình hay đi cùng xung quanh.
        </p>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-96 shrink-0 space-y-5 overflow-y-auto border-r border-slate-800 p-4">
          <CityMiningPanel
            datasets={datasets}
            selectedCity={selectedCity}
            onSelectCity={handleSelectCity}
            epsM={epsM}
            minPrev={minPrev}
            onEps={setEpsM}
            onMinPrev={setMinPrev}
            onRun={handleRun}
            onCancel={cancel}
            running={running}
            job={job}
            jobError={jobError}
            hasResult={Boolean(result)}
          />

          {ready && (
            <>
              <DiscoveryRadiusControl radiusM={radiusM} epsM={minedEps} onChange={setRadiusM} />
              <div>
                <h2 className="mb-2 text-sm font-semibold text-slate-300">
                  {selected
                    ? `Quanh ${selected.name || selected.feature}`
                    : 'Nhấp vào một nơi trên bản đồ'}
                </h2>
                {detailError && <p className="text-sm text-rose-400">{detailError}</p>}
                {selected && !detail && !detailError && (
                  <p className="text-sm text-slate-500">Đang tìm xung quanh…</p>
                )}
                {selected && detail && (
                  <NearbyList
                    tier1={tier1}
                    tier2={tier2}
                    noPatternsAtAll={detail.patterns.length === 0}
                    onSelectPoi={setPopupPoi}
                    selectedId={popupPoi?.id}
                  />
                )}
              </div>
            </>
          )}
        </aside>

        <main className="relative min-h-0 flex-1 p-3">
          <LeafletMap
            instances={instances}
            colors={colors}
            selected={selected}
            neighbors={mapNeighbors}
            radiusM={ready && selected ? radiusM : 0}
            onSelect={handlePoiClick}
            crs="latlon"
            onRecenterReady={handleRecenterReady}
          />
          {instances.length > 0 && (
            <button
              type="button"
              onClick={() => recenterRef.current?.()}
              className="absolute right-4 top-4 z-[1000] rounded-md bg-slate-800/90 px-3 py-1.5 text-xs font-medium text-slate-200 shadow hover:bg-slate-700"
              title="Về toàn thành phố"
            >
              ↻ Toàn TP
            </button>
          )}
          {popupPoi && (
            <div className="absolute bottom-6 left-6 z-[1000] w-72">
              <PoiPopup
                poi={popupPoi}
                tier1Info={tier1.find((p) => p.id === popupPoi.id)}
                onClose={() => setPopupPoi(null)}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
