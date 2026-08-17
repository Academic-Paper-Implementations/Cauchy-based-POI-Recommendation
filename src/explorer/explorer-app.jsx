import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../config/api';
import { buildFeatureColors } from '../utils/feature-colors';
import { useMiningJob, RARE_MIN_COUNT, DEFAULT_RARE_PERCENTILE } from '../hooks/use-mining-job';
import LeafletMap from '../components/leaflet-map.jsx';
import CityMiningPanel from './city-mining-panel.jsx';
import ClusterGroupList from './cluster-group-list.jsx';
import DiscoveryRadiusControl from './discovery-radius-control.jsx';
import PoiPopup from './poi-popup.jsx';
import { miningRequest, DEFAULT_EPS_M, DEFAULT_MIN_PREV } from './mining-request';

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

  const { job, jobError, result, running, run, reset } = useMiningJob();
  const detailAbortRef = useRef(null);

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
    (city) => {
      setSelectedCity(city);
      reset();
      clearSelection();
      setInstances([]);
      if (!city) return;
      api
        .instances(city)
        // is_open === "0" is a permanently-closed business — not worth showing.
        .then((body) =>
          setInstances((body.instances || []).filter((i) => i.attributes?.is_open !== '0'))
        )
        .catch(() => setInstances([]));
    },
    [reset, clearSelection]
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
  const handlePoiClick = useCallback(
    (poi) => {
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
    [job]
  );

  // Groups within the current discovery radius (a pure view filter — no re-mine).
  const groups = useMemo(() => {
    if (!detail?.patterns) return [];
    const originId = detail.instance?.id;
    return detail.patterns
      .map((pattern) => ({
        features: pattern.features,
        members: (pattern.neighbors || [])
          // Within the view radius, and never the clicked place listing itself.
          .filter((n) => n.distance_m <= radiusM && n.id !== originId)
          .sort((a, b) => a.distance_m - b.distance_m),
      }))
      .filter((group) => group.members.length > 0);
  }, [detail, radiusM]);

  // Everything highlighted on the map = the in-radius members, de-duplicated.
  const mapNeighbors = useMemo(() => {
    const seen = new Map();
    for (const group of groups) {
      for (const member of group.members) seen.set(member.id, member);
    }
    return [...seen.values()];
  }, [groups]);

  const ready = job?.status === 'done';

  return (
    <div className="flex h-screen flex-col bg-slate-900 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-3">
        <h1 className="text-lg font-semibold">Co-located Spot Explorer</h1>
        <p className="text-sm text-slate-400">
          Search a city, then click a place to see the kinds of spots that cluster around it.
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
                    ? `Around ${selected.name || selected.feature}`
                    : 'Click a place on the map'}
                </h2>
                {detailError && <p className="text-sm text-rose-400">{detailError}</p>}
                {selected && !detail && !detailError && (
                  <p className="text-sm text-slate-500">Finding what's around here…</p>
                )}
                {selected && detail && (
                  <ClusterGroupList
                    groups={groups}
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
          />
          {popupPoi && (
            <div className="absolute bottom-6 left-6 z-[1000] w-72">
              <PoiPopup poi={popupPoi} onClose={() => setPopupPoi(null)} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
