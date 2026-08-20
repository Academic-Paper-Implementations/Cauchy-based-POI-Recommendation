import {
  EPS_MIN_M,
  EPS_MAX_M,
  MIN_PREV_MIN,
  MIN_PREV_MAX,
  rangeError,
} from './mining-request';

const STAGE_LABELS = {
  load: 'Loading places…',
  neighbor_graph: 'Finding nearby places…',
  maximal_clique: 'Grouping co-located types…',
  mining: 'Evaluating groups…',
  export: 'Finishing…',
  done: 'Done',
};

function ProgressBar({ job }) {
  if (!job || job.status !== 'running') return null;
  const { stage_index, stage_count } = job;
  if (stage_count == null || stage_count <= 1) return null;
  const workStages = stage_count - 1;
  const fraction = Math.min(1, Math.max(0, (stage_index + 1) / workStages));
  const pct = Math.round(fraction * 100);

  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-700"
      >
        <div
          className="h-full bg-sky-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-sm text-slate-400">
        {STAGE_LABELS[job.stage] || job.stage}
        {job.elapsed_s != null && ` — ${job.elapsed_s.toFixed(1)}s`}
      </p>
    </div>
  );
}

function SuccessBanner({ job, result }) {
  if (!result || job?.status !== 'done') return null;
  const count = result.pattern_count ?? 0;
  return (
    <p className="text-sm text-emerald-400">
      ✓ Done — {count} group{count !== 1 ? 's' : ''} found
    </p>
  );
}

function MinedBadge({ job, result, cityLabel }) {
  if (!result || !job?.params) return null;
  const { eps_m, min_prev } = job.params;
  const count = result.pattern_count ?? 0;
  return (
    <p className="text-xs text-slate-400">
      Mined: {cityLabel} · ε {eps_m} m · popularity {min_prev} → {count} group{count !== 1 ? 's' : ''}
    </p>
  );
}

export default function CityMiningPanel({
  datasets,
  selectedCity,
  onSelectCity,
  epsM,
  minPrev,
  onEps,
  onMinPrev,
  onRun,
  onCancel,
  running,
  job,
  jobError,
  result,
}) {
  const epsError = rangeError(epsM, EPS_MIN_M, EPS_MAX_M);
  const minPrevError = rangeError(minPrev, MIN_PREV_MIN, MIN_PREV_MAX);
  const hasValidationError = Boolean(epsError || minPrevError);
  const hasResult = Boolean(result);
  const cityLabel = datasets.find((d) => d.id === job?.params?.dataset_id)?.label || selectedCity;
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="city" className="mb-1 block text-sm text-slate-300">
          City
        </label>
        <select
          id="city"
          value={selectedCity || ''}
          onChange={(event) => onSelectCity(event.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
        >
          <option value="" disabled>
            Select a city…
          </option>
          {datasets.map((dataset) => (
            <option key={dataset.id} value={dataset.id}>
              {dataset.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="eps" className="mb-1 block text-sm text-slate-300">
            Search distance (m)
          </label>
          <input
            id="eps"
            type="number"
            min={EPS_MIN_M}
            max={EPS_MAX_M}
            step={10}
            value={epsM}
            onChange={(event) => onEps(Number(event.target.value))}
            className={`w-full rounded-md border bg-slate-800 px-3 py-2 text-sm text-slate-100 ${
              epsError ? 'border-rose-500' : 'border-slate-700'
            }`}
          />
          {epsError && <p className="mt-1 text-xs text-rose-400">{epsError}</p>}
        </div>
        <div>
          <label htmlFor="minprev" className="mb-1 block text-sm text-slate-300">
            Popularity (0–1)
          </label>
          <input
            id="minprev"
            type="number"
            min={MIN_PREV_MIN}
            max={MIN_PREV_MAX}
            step={0.05}
            value={minPrev}
            onChange={(event) => onMinPrev(Number(event.target.value))}
            className={`w-full rounded-md border bg-slate-800 px-3 py-2 text-sm text-slate-100 ${
              minPrevError ? 'border-rose-500' : 'border-slate-700'
            }`}
          />
          {minPrevError && <p className="mt-1 text-xs text-rose-400">{minPrevError}</p>}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRun}
          disabled={!selectedCity || running || hasValidationError}
          className="flex-1 rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-sky-400 disabled:opacity-40"
        >
          {running ? 'Searching…' : hasResult ? 'Search again' : 'Find co-located spots'}
        </button>
        {running && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-600"
          >
            Cancel
          </button>
        )}
      </div>

      {running && <ProgressBar job={job} />}
      {!running && <SuccessBanner job={job} result={result} />}
      {!running && <MinedBadge job={job} result={result} cityLabel={cityLabel} />}
      {jobError && <p className="text-sm text-rose-400">{jobError}</p>}
      <p className="text-xs text-slate-500">
        Search may take a few minutes for larger cities; results are cached, so
        the same settings will return instantly next time.
      </p>
    </div>
  );
}
