// Pick a city and run a co-location search. This keeps the standard mining job
// flow (the user sets the search distance and how common a group must be, and
// each run reflects those), but labels the two knobs in plain words instead of
// the research jargon.

const STAGE_LABELS = {
  load: 'Loading places…',
  neighbor_graph: 'Finding what is near what…',
  maximal_clique: 'Grouping co-located types…',
  mining: 'Scoring the groups…',
  export: 'Finishing…',
  done: 'Done',
};

export default function CityMiningPanel({
  datasets,
  selectedCity,
  onSelectCity,
  epsM,
  minPrev,
  onEps,
  onMinPrev,
  onRun,
  running,
  job,
  jobError,
  hasResult,
}) {
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
            Choose a city…
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
            min={20}
            max={300}
            step={10}
            value={epsM}
            onChange={(event) => onEps(Number(event.target.value))}
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
          />
        </div>
        <div>
          <label htmlFor="minprev" className="mb-1 block text-sm text-slate-300">
            How common (0–1)
          </label>
          <input
            id="minprev"
            type="number"
            min={0.05}
            max={1}
            step={0.05}
            value={minPrev}
            onChange={(event) => onMinPrev(Number(event.target.value))}
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onRun}
        disabled={!selectedCity || running}
        className="w-full rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-sky-400 disabled:opacity-40"
      >
        {running ? 'Searching…' : hasResult ? 'Search again' : 'Find co-located places'}
      </button>

      {running && job?.stage && (
        <p className="text-sm text-slate-400">{STAGE_LABELS[job.stage] || job.stage}</p>
      )}
      {jobError && <p className="text-sm text-rose-400">{jobError}</p>}
      <p className="text-xs text-slate-500">
        A search can take up to a couple of minutes for a large city; the result is cached,
        so the same settings return instantly next time.
      </p>
    </div>
  );
}
