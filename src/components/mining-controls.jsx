// Mining parameters. Epsilon and min prevalence both change what the miner
// traverses, so they sit behind one "Run mining" button — there is no cheap way
// to move them after the fact. The rare-threshold slider is deliberately
// separate: it only relabels an existing result.

export default function MiningControls({
  datasets,
  datasetId,
  onDatasetChange,
  params,
  onParamsChange,
  onRun,
  onCancel,
  running,
  disabled,
}) {
  const set = (field) => (event) =>
    onParamsChange({ ...params, [field]: Number(event.target.value) });

  return (
    <div className="card space-y-4 p-4">
      <div>
        <label htmlFor="dataset" className="mb-1 block text-sm font-medium text-slate-300">
          Dataset
        </label>
        <select
          id="dataset"
          className="select-field w-full"
          value={datasetId}
          onChange={(event) => onDatasetChange(event.target.value)}
          disabled={running}
        >
          {datasets.map((dataset) => (
            <option key={dataset.id} value={dataset.id}>
              {dataset.label} — {dataset.instance_count.toLocaleString()} instances
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="eps-m" className="mb-1 block text-sm font-medium text-slate-300">
            Neighbour distance ε (m)
          </label>
          <input
            id="eps-m"
            type="number"
            min="1"
            step="10"
            className="input-field w-full"
            value={params.epsM}
            onChange={set('epsM')}
            disabled={running}
          />
        </div>
        <div>
          <label htmlFor="min-prev" className="mb-1 block text-sm font-medium text-slate-300">
            Min prevalence
          </label>
          <input
            id="min-prev"
            type="number"
            min="0"
            max="1"
            step="0.05"
            className="input-field w-full"
            value={params.minPrev}
            onChange={set('minPrev')}
            disabled={running}
          />
        </div>
      </div>

      <div>
        <label htmlFor="sample-pct" className="mb-1 block text-sm font-medium text-slate-300">
          Instances per feature: {Math.round(params.samplePct * 100)}%
        </label>
        <input
          id="sample-pct"
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          className="w-full"
          value={params.samplePct}
          onChange={set('samplePct')}
          disabled={running}
        />
        <p className="mt-1 text-xs text-slate-500">
          Full data by default. Lower it only to trade completeness for a faster run.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          className="btn-primary flex-1 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onRun}
          disabled={running || disabled}
        >
          Run mining
        </button>
        <button
          className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onCancel}
          disabled={!running}
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-slate-500">
        Runtime grows steeply with ε. On Philadelphia: ~2 s at 60 m, ~7 s at 80 m,
        ~63 s at 100 m, and over 20 minutes at 150 m. Repeat runs come from the cache.
      </p>
    </div>
  );
}
