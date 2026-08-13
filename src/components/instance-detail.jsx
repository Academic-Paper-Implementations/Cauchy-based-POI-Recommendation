import { useMemo } from 'react';
import { PatternFeatures, PatternWpi } from './pattern-list';

// What a clicked point takes part in. Selecting one of its patterns highlights
// the neighbours that co-participate in that same pattern, which is the whole
// point of the view: the pattern is visible on the map, not just asserted in a
// table.

export default function InstanceDetail({
  instance,
  detail,
  loading,
  error,
  rareFeatures,
  colors,
  selectedIndex,
  onSelectPattern,
  onClear,
}) {
  const rare = useMemo(() => new Set(rareFeatures), [rareFeatures]);

  if (!instance) {
    return (
      <div className="card h-full p-4 text-sm text-slate-400">
        Click a point on the map to see the patterns it participates in.
      </div>
    );
  }

  return (
    // See pattern-list.jsx: `h-full` bounds the card so the list below scrolls.
    <div className="card flex h-full min-h-0 flex-col p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-primary-400">
            {instance.feature} · {instance.number}
          </h2>
          <p className="break-all font-mono text-xs text-slate-500">{instance.id}</p>
        </div>
        <button className="btn-secondary px-2 py-1 text-xs" onClick={onClear}>
          Clear
        </button>
      </div>

      {loading && <p className="text-sm text-slate-400">Looking up patterns…</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}

      {detail && !loading && (
        <>
          <p className="mb-2 text-xs text-slate-400">
            In {detail.pattern_count} pattern{detail.pattern_count === 1 ? '' : 's'} · neighbours
            within ε = {detail.eps_m} m
          </p>

          <div className="min-h-0 flex-1 space-y-2 overflow-auto">
            {detail.patterns.map((pattern) => (
              <button
                key={pattern.pattern_index}
                onClick={() => onSelectPattern(pattern)}
                className={`block w-full rounded border p-2 text-left transition-colors ${
                  pattern.pattern_index === selectedIndex
                    ? 'border-primary-500 bg-slate-700/60'
                    : 'border-slate-700 hover:bg-slate-700/40'
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-slate-500">size {pattern.size}</span>
                  <PatternWpi pattern={pattern} />
                </div>
                <PatternFeatures pattern={pattern} rare={rare} colors={colors} />
                <p className="mt-1 text-xs text-slate-500">
                  {pattern.neighbors.length} co-participating neighbour
                  {pattern.neighbors.length === 1 ? '' : 's'} nearby
                </p>
              </button>
            ))}
            {detail.pattern_count === 0 && (
              <p className="text-sm text-slate-400">
                This instance does not participate in any prevalent pattern at these
                parameters.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
