import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './config/api';
import { buildFeatureColors } from './utils/feature-colors';
import MiningMap from './components/mining-map';
import MiningControls from './components/mining-controls';
import JobProgress from './components/job-progress';
import PatternList from './components/pattern-list';
import InstanceDetail from './components/instance-detail';
import DataUpload from './components/DataUpload';

// Plotly is only needed for datasets without lat/lon, and it is by far the
// heaviest dependency here — loading it on demand keeps the map path light.
const SpatialMap = lazy(() => import('./components/SpatialMap'));

const DEFAULT_PARAMS = { epsM: 80, minPrev: 0.2, samplePct: 1 };
const RARE_MIN_COUNT = 30;
const POLL_MS = 1000;

const isActive = (job) => job && (job.status === 'running' || job.status === 'queued');

export default function App() {
  const [datasets, setDatasets] = useState([]);
  const [datasetId, setDatasetId] = useState('');
  const [instances, setInstances] = useState([]);
  const [hasLatLon, setHasLatLon] = useState(true);

  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [job, setJob] = useState(null);
  const [jobError, setJobError] = useState('');

  const [result, setResult] = useState(null);
  const [rarePercentile, setRarePercentile] = useState(25);

  const [selectedInstance, setSelectedInstance] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [selectedPatternIndex, setSelectedPatternIndex] = useState(null);

  const [showUpload, setShowUpload] = useState(false);

  const pollRef = useRef(null);

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
    loadDatasets().catch((error) => setJobError(error.message));
  }, [loadDatasets]);

  // Switching dataset invalidates everything downstream of it.
  useEffect(() => {
    if (!datasetId) return;
    let cancelled = false;
    setJob(null);
    setResult(null);
    setSelectedInstance(null);
    setDetail(null);
    setSelectedPatternIndex(null);
    api
      .instances(datasetId)
      .then((body) => {
        if (cancelled) return;
        setInstances(body.instances);
        setHasLatLon(body.has_latlon);
      })
      .catch((error) => !cancelled && setJobError(error.message));
    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  const loadResult = useCallback(
    async (jobId, percentile) => {
      const body = await api.result(jobId, {
        rarePercentile: percentile,
        rareMinCount: RARE_MIN_COUNT,
      });
      setResult(body);
    },
    []
  );

  // Poll while a job is in flight; the miner reports stages, not percentages.
  useEffect(() => {
    if (!isActive(job)) return undefined;
    pollRef.current = setInterval(async () => {
      try {
        const next = await api.job(job.job_id);
        setJob(next);
        if (next.status === 'done') {
          await loadResult(next.job_id, rarePercentile);
        }
      } catch (error) {
        setJobError(error.message);
      }
    }, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [job, rarePercentile, loadResult]);

  const runMining = async () => {
    setJobError('');
    setResult(null);
    setDetail(null);
    setSelectedPatternIndex(null);
    try {
      const created = await api.createJob({
        dataset_id: datasetId,
        eps_m: params.epsM,
        min_prev: params.minPrev,
        sample_pct: params.samplePct,
      });
      setJob(created);
      if (created.status === 'done') await loadResult(created.job_id, rarePercentile);
      if (created.status === 'failed') setJobError(created.error);
    } catch (error) {
      setJobError(error.message);
    }
  };

  const cancelMining = async () => {
    if (!job) return;
    try {
      setJob(await api.cancelJob(job.job_id));
    } catch (error) {
      setJobError(error.message);
    }
  };

  const changeRarePercentile = async (value) => {
    setRarePercentile(value);
    if (!job || job.status !== 'done') return;
    try {
      await loadResult(job.job_id, value);
      if (selectedInstance) await loadDetail(selectedInstance, value);
    } catch (error) {
      setJobError(error.message);
    }
  };

  const loadDetail = useCallback(
    async (instance, percentile) => {
      setDetailLoading(true);
      setDetailError('');
      try {
        const body = await api.instancePatterns(job.job_id, instance.feature, instance.number, {
          rarePercentile: percentile,
          rareMinCount: RARE_MIN_COUNT,
        });
        setDetail(body);
        setSelectedPatternIndex(body.patterns[0]?.pattern_index ?? null);
      } catch (error) {
        setDetailError(error.message);
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [job]
  );

  const selectInstance = useCallback(
    (instance) => {
      setSelectedInstance(instance);
      setSelectedPatternIndex(null);
      setDetail(null);
      if (job?.status === 'done') loadDetail(instance, rarePercentile);
      else setDetailError('Run mining first to see which patterns this point is in.');
    },
    [job, rarePercentile, loadDetail]
  );

  // The map binds a click handler to every marker, so that handler has to keep
  // the same identity across renders: while a job polls, `job` changes once a
  // second, and a handler that changed with it would rebuild ~10k markers (and
  // refit the view, fighting the user's panning) on every tick.
  const selectInstanceRef = useRef(selectInstance);
  selectInstanceRef.current = selectInstance;
  const handleSelect = useCallback((instance) => selectInstanceRef.current(instance), []);

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
  const mapProps = {
    instances,
    colors,
    selected: selectedInstance,
    neighbors: highlightedNeighbors,
    radiusM: job?.params?.eps_m ?? null,
    onSelect: handleSelect,
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

      <main className="grid min-h-0 flex-1 grid-cols-12 gap-4 p-4">
        <aside className="col-span-12 flex min-h-0 flex-col gap-4 overflow-auto lg:col-span-3">
          <MiningControls
            datasets={datasets}
            datasetId={datasetId}
            onDatasetChange={setDatasetId}
            params={params}
            onParamsChange={setParams}
            onRun={runMining}
            onCancel={cancelMining}
            running={isActive(job)}
            disabled={!datasetId}
          />
          <JobProgress job={job} error={jobError} />
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

        <section className="col-span-12 min-h-0 lg:col-span-5">
          <div className="card h-full overflow-hidden p-1">
            {hasLatLon ? (
              <MiningMap {...mapProps} />
            ) : (
              <Suspense
                fallback={<div className="p-4 text-sm text-slate-400">Loading plot…</div>}
              >
                <SpatialMap {...mapProps} />
              </Suspense>
            )}
          </div>
        </section>

        <aside className="col-span-12 flex min-h-0 flex-col gap-4 lg:col-span-4">
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
        </aside>
      </main>
    </div>
  );
}
