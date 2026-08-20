import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './config/api';
import { buildFeatureColors } from './utils/feature-colors';
import LeafletMap from './components/leaflet-map';
import MiningControls from './components/mining-controls';
import JobProgress from './components/job-progress';
import PatternList from './components/pattern-list';
import InstanceDetail from './components/instance-detail';
import DataUpload from './components/data-upload';
import ModeToggle from './components/mode-toggle';
import FeatureRecommendations from './components/feature-recommendations';
import AreaRecommendations from './components/area-recommendations';
import { useMiningJob, RARE_MIN_COUNT } from './hooks/use-mining-job';

const DEFAULT_PARAMS = { epsM: 80, minPrev: 0.2, samplePct: 1 };
const RUN_MINING_FIRST = 'Chạy mining trước để có khuyến nghị.';
// Ten regions is what a person can actually compare in one list.
const AREA_TOP = 10;

export default function App() {
  const [datasets, setDatasets] = useState([]);
  const [datasetId, setDatasetId] = useState('');
  const [instances, setInstances] = useState([]);
  const [hasLatLon, setHasLatLon] = useState(true);

  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [instancesLoading, setInstancesLoading] = useState(false);
  // Loading the dataset is its own failure channel: sharing one state with the
  // job made a dataset error look like a job error.
  const [appError, setAppError] = useState('');

  const {
    job,
    jobError,
    pollError,
    result,
    rarePercentile,
    appliedPercentile,
    running,
    run,
    cancel,
    changeRarePercentile,
    reset: resetJob,
  } = useMiningJob();

  const [selectedInstance, setSelectedInstance] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [selectedPatternIndex, setSelectedPatternIndex] = useState(null);

  const [showUpload, setShowUpload] = useState(false);

  // Investor view. Both panels read a finished result; neither re-runs the miner.
  const [mode, setMode] = useState('investor');
  const [recommendations, setRecommendations] = useState(null);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [recommendError, setRecommendError] = useState('');
  const [areaFeature, setAreaFeature] = useState('');
  const [regions, setRegions] = useState(null);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [regionsError, setRegionsError] = useState('');
  const [focusRegion, setFocusRegion] = useState(null);

  const colors = useMemo(
    () => buildFeatureColors(instances.map((i) => i.feature)),
    [instances]
  );

  const loadDatasets = useCallback(async (preferId) => {
    const body = await api.datasets();
    setDatasets(body.datasets);
    const next = preferId || body.datasets[0]?.id || '';
    setDatasetId((current) => (body.datasets.some((d) => d.id === current) && !preferId ? current : next));
  }, []);

  useEffect(() => {
    loadDatasets().catch((error) => setAppError(error.message));
  }, [loadDatasets]);

  // Switching dataset invalidates everything downstream of it.
  useEffect(() => {
    if (!datasetId) return undefined;
    const controller = new AbortController();
    resetJob();
    setSelectedInstance(null);
    setDetail(null);
    setSelectedPatternIndex(null);
    setAppError('');
    setAreaFeature('');
    setRegions(null);
    setRecommendations(null);
    // A region belongs to the dataset it was scored on. Left in place it would
    // re-frame the new map onto coordinates that mean nothing there.
    setFocusRegion(null);
    setInstancesLoading(true);
    api
      .instances(datasetId, { signal: controller.signal })
      .then((body) => {
        setInstances(body.instances);
        setHasLatLon(body.has_latlon);
        setInstancesLoading(false);
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setAppError(error.message);
        setInstancesLoading(false);
      });
    return () => controller.abort();
  }, [datasetId, resetJob]);

  const runMining = () => {
    setDetail(null);
    setSelectedPatternIndex(null);
    return run({
      dataset_id: datasetId,
      eps_m: params.epsM,
      min_prev: params.minPrev,
      sample_pct: params.samplePct,
    });
  };

  const detailTokenRef = useRef(0);
  const loadDetail = useCallback(
    async (instance, percentile) => {
      const token = (detailTokenRef.current += 1);
      setDetailLoading(true);
      setDetailError('');
      try {
        const body = await api.instancePatterns(job.job_id, instance.feature, instance.number, {
          rarePercentile: percentile,
          rareMinCount: RARE_MIN_COUNT,
        });
        // A click or a threshold move that landed while this was in flight owns
        // the panel now; this answer is about a point the user has left behind.
        if (token !== detailTokenRef.current) return;
        setDetail(body);
        setSelectedPatternIndex(body.patterns[0]?.pattern_index ?? null);
      } catch (error) {
        if (token !== detailTokenRef.current) return;
        setDetailError(error.message);
        setDetail(null);
      } finally {
        if (token === detailTokenRef.current) setDetailLoading(false);
      }
    },
    [job]
  );

  const selectInstance = useCallback(
    (instance) => {
      setSelectedInstance(instance);
      setSelectedPatternIndex(null);
      setDetail(null);
      // Investor view answers the click through its own endpoint, in the effect
      // below; fetching the pattern detail here too would be a wasted request.
      if (mode !== 'mining') return;
      if (job?.status === 'done') loadDetail(instance, appliedPercentile);
      else setDetailError('Run mining first to see which patterns this point is in.');
    },
    [job, appliedPercentile, loadDetail, mode]
  );

  // Relabelling the result relabels what the open panel says about one point, so
  // the detail follows the threshold the result was actually loaded with.
  const relabelRef = useRef(appliedPercentile);
  useEffect(() => {
    if (relabelRef.current === appliedPercentile) return;
    relabelRef.current = appliedPercentile;
    if (mode === 'mining' && selectedInstance && job?.status === 'done') {
      loadDetail(selectedInstance, appliedPercentile);
    }
  }, [appliedPercentile, mode, selectedInstance, job, loadDetail]);

  // Investor view: what to build at the clicked point. Guarded on the mode so
  // neither endpoint is called while the other view is open.
  useEffect(() => {
    if (mode !== 'investor' || !selectedInstance) return undefined;
    if (job?.status !== 'done') {
      setRecommendations(null);
      setRecommendError(RUN_MINING_FIRST);
      return undefined;
    }

    const controller = new AbortController();
    setRecommendLoading(true);
    setRecommendError('');
    api
      .instanceRecommendations(
        job.job_id,
        selectedInstance.feature,
        selectedInstance.number,
        { rarePercentile: appliedPercentile, rareMinCount: RARE_MIN_COUNT },
        { signal: controller.signal }
      )
      .then((body) => {
        setRecommendations(body.recommendations);
        setRecommendLoading(false);
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setRecommendError(error.message);
        setRecommendations(null);
        setRecommendLoading(false);
      });

    return () => controller.abort();
  }, [mode, selectedInstance, job, appliedPercentile]);

  // Investor view: where one feature belongs.
  useEffect(() => {
    setFocusRegion(null);
    if (mode !== 'investor' || !areaFeature) {
      setRegions(null);
      return undefined;
    }
    if (job?.status !== 'done') {
      setRegions(null);
      setRegionsError(RUN_MINING_FIRST);
      return undefined;
    }

    const controller = new AbortController();
    setRegionsLoading(true);
    setRegionsError('');
    api
      .siteRecommendations(job.job_id, areaFeature, AREA_TOP, { signal: controller.signal })
      .then((body) => {
        setRegions(body.regions);
        setRegionsLoading(false);
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setRegionsError(error.message);
        setRegions(null);
        setRegionsLoading(false);
      });

    return () => controller.abort();
  }, [mode, areaFeature, job]);

  // The map binds a click handler to every marker, so that handler has to keep
  // the same identity across renders: while a job polls, `job` changes once a
  // second, and a handler that changed with it would rebuild ~10k markers (and
  // refit the view, fighting the user's panning) on every tick.
  const selectInstanceRef = useRef(selectInstance);
  selectInstanceRef.current = selectInstance;
  const handleSelect = useCallback((instance) => selectInstanceRef.current(instance), []);

  // Each view answers a click through its own endpoint, and neither is called
  // while the other is open. Arriving in Mining view with a point already picked
  // in Investor view is the one case where the answer has to be fetched late.
  const changeMode = (next) => {
    setMode(next);
    if (next === 'mining' && selectedInstance && !detail && job?.status === 'done') {
      loadDetail(selectedInstance, appliedPercentile);
    }
  };

  const clearSelection = () => {
    setSelectedInstance(null);
    setDetail(null);
    setDetailError('');
    setSelectedPatternIndex(null);
  };

  const highlightedNeighbors = useMemo(() => {
    if (!detail || selectedPatternIndex === null) return [];
    const pattern = detail.patterns.find((p) => p.pattern_index === selectedPatternIndex);
    return pattern ? pattern.neighbors : [];
  }, [detail, selectedPatternIndex]);

  const activeDataset = datasets.find((d) => d.id === datasetId);

  // The picker offers whatever the result reports, falling back to the dataset so
  // a feature can be chosen before the first run.
  const featureNames = useMemo(
    () => Object.keys(result?.feature_counts ?? activeDataset?.feature_counts ?? {}).sort(),
    [result, activeDataset]
  );

  const mapProps = {
    instances,
    colors,
    selected: selectedInstance,
    neighbors: highlightedNeighbors,
    radiusM: job?.params?.eps_m ?? null,
    onSelect: handleSelect,
    // Datasets without lat/lon have nothing to put a street map under, so they
    // are drawn in their own metres on a flat CRS.
    crs: hasLatLon ? 'latlon' : 'xy',
    regions: mode === 'investor' ? regions : null,
    onRegionSelect: setFocusRegion,
    focusRegion,
  };

  return (
    <div className="flex h-screen flex-col bg-slate-900 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 bg-slate-900/80 px-6 py-3">
        <div>
          <h1 className="bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-xl font-bold text-transparent">
            Co-location Pattern Explorer
          </h1>
          <p className="text-xs text-slate-400">
            Clique-based mining with Cauchy rare-feature weighting · C++ engine
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <ModeToggle mode={mode} onChange={changeMode} />
          {activeDataset && (
            <span>
              {activeDataset.instance_count.toLocaleString()} instances ·{' '}
              {activeDataset.feature_count} features
            </span>
          )}
          <button className="btn-secondary px-3 py-1" onClick={() => setShowUpload((v) => !v)}>
            {showUpload ? 'Close upload' : 'Upload CSV'}
          </button>
        </div>
      </header>

      {appError && (
        <div className="border-b border-red-500/40 bg-red-500/10 px-6 py-2 text-sm text-red-300">
          {appError}
        </div>
      )}

      {/* Desktop is the target: below `lg` the three panels stack into auto-height
          grid rows, where a card's `h-full` resolves against nothing and the map
          collapses to zero. So below `lg` the page scrolls and the panels carry
          explicit heights; from `lg` up the grid owns the viewport and each card
          scrolls inside its own frame. */}
      <main className="grid flex-1 grid-cols-12 gap-4 overflow-auto p-4 lg:min-h-0 lg:overflow-hidden">
        <aside className="col-span-12 flex min-h-[320px] flex-col gap-4 lg:col-span-3 lg:min-h-0 lg:overflow-auto">
          <MiningControls
            datasets={datasets}
            datasetId={datasetId}
            onDatasetChange={setDatasetId}
            params={params}
            onParamsChange={setParams}
            onRun={runMining}
            onCancel={cancel}
            running={running}
            disabled={!datasetId}
          />
          <JobProgress job={job} error={jobError || pollError} />
          {showUpload && (
            <DataUpload
              onUploaded={async (dataset) => {
                await loadDatasets(dataset.id);
                setDatasetId(dataset.id);
                setShowUpload(false);
              }}
            />
          )}
        </aside>

        <section className="col-span-12 h-[60vh] min-h-[360px] lg:col-span-5 lg:h-auto lg:min-h-0">
          <div className="relative card h-full overflow-hidden p-1">
            <LeafletMap {...mapProps} />
            {/* Ten to seventeen thousand points take a moment to arrive. Without
                this the map is simply blank, which reads as an empty dataset. */}
            {instancesLoading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-900/70 text-sm text-slate-300">
                Đang nạp điểm dữ liệu…
              </div>
            )}
          </div>
        </section>

        <aside className="col-span-12 flex min-h-[640px] flex-col gap-4 lg:col-span-4 lg:min-h-0">
          {mode === 'investor' ? (
            <>
              {/* Say plainly what these numbers are. They rank co-location support
                  in patterns the miner found; they are not a forecast of trade. */}
              <p className="rounded border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-400">
                Khuyến nghị dựa trên pattern co-location đã khai phá từ dữ liệu này — không
                phải dự báo kết quả kinh doanh. Mở <span className="text-slate-200">Lý do</span>{' '}
                ở mỗi dòng để xem pattern nào tạo ra điểm số.
              </p>
              <div className="min-h-0 flex-1">
                <FeatureRecommendations
                  instance={selectedInstance}
                  recommendations={recommendations}
                  loading={recommendLoading}
                  error={recommendError}
                  rareFeatures={result?.rare_features ?? []}
                  colors={colors}
                />
              </div>
              <div className="min-h-0 flex-1">
                <AreaRecommendations
                  features={featureNames}
                  feature={areaFeature}
                  onFeatureChange={setAreaFeature}
                  regions={regions}
                  loading={regionsLoading}
                  error={regionsError}
                  onFocusRegion={setFocusRegion}
                  rareFeatures={result?.rare_features ?? []}
                  colors={colors}
                />
              </div>
            </>
          ) : (
            <>
              <div className="min-h-0 flex-1">
                <InstanceDetail
                  instance={selectedInstance}
                  detail={detail}
                  loading={detailLoading}
                  error={detailError}
                  rareFeatures={result?.rare_features ?? []}
                  colors={colors}
                  selectedIndex={selectedPatternIndex}
                  onSelectPattern={(pattern) => setSelectedPatternIndex(pattern.pattern_index)}
                  onClear={clearSelection}
                />
              </div>
              <div className="min-h-0 flex-1">
                <PatternList
                  result={result}
                  colors={colors}
                  rarePercentile={rarePercentile}
                  onRarePercentileChange={changeRarePercentile}
                  selectedIndex={selectedPatternIndex}
                  onSelect={(pattern) => setSelectedPatternIndex(pattern.pattern_index)}
                />
              </div>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
