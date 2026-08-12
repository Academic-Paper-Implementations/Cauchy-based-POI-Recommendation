import { useMemo, useState } from 'react';
import { featureColor } from '../utils/feature-colors';

// The pattern table. Each row shows how many instances of every feature take
// part, and a rare feature's number is printed in red — seeing "American (New):
// 28" in red next to "Restaurants: 1,933" explains the rarity without a legend,
// a filter, or a separate sort.

const PAGE_SIZE = 50;

export function PatternFeatures({ pattern, rareFeatures, colors }) {
  const rare = new Set(rareFeatures);
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {pattern.features.map((feature) => (
        <span key={feature} className="whitespace-nowrap text-xs">
          <span style={{ color: featureColor(colors, feature) }}>{feature}</span>
          <span className="text-slate-500">: </span>
          <span
            className={rare.has(feature) ? 'font-semibold text-red-400' : 'text-slate-300'}
          >
            {(pattern.participation_counts[feature] ?? 0).toLocaleString()}
          </span>
        </span>
      ))}
    </div>
  );
}

export function PatternWpi({ pattern }) {
  if (pattern.deduced && pattern.wpi === null) {
    return (
      <span
        className="text-xs text-amber-300"
        title="Accepted as a subset of a prevalent pattern (Lemma 2). No WPI was computed for it."
      >
        deduced
      </span>
    );
  }
  return <span className="font-mono text-xs text-slate-200">{pattern.wpi.toFixed(4)}</span>;
}

export default function PatternList({
  result,
  colors,
  rarePercentile,
  onRarePercentileChange,
  selectedIndex,
  onSelect,
}) {
  const [page, setPage] = useState(0);

  // Highest WPI first; patterns with no computed WPI sort to the end.
  const ordered = useMemo(() => {
    if (!result) return [];
    return [...result.patterns].sort((a, b) => {
      if (a.wpi === null && b.wpi === null) return b.size - a.size;
      if (a.wpi === null) return 1;
      if (b.wpi === null) return -1;
      return b.wpi - a.wpi;
    });
  }, [result]);

  if (!result) {
    return (
      <div className="card p-4 text-sm text-slate-400">
        Run mining to see prevalent patterns.
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const rows = ordered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="card flex min-h-0 flex-col p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-primary-400">
          {result.pattern_count.toLocaleString()} prevalent patterns
        </h2>
        <span className="font-mono text-xs text-slate-500">κ = {result.kappa.toFixed(4)}</span>
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs text-slate-400">
          Rare threshold: {rarePercentile}th percentile → ≤{' '}
          {result.rare_threshold.toLocaleString()} instances ({result.rare_features.length}{' '}
          features)
        </label>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          className="w-full"
          value={rarePercentile}
          onChange={(event) => onRarePercentileChange(Number(event.target.value))}
        />
        <p className="text-xs text-slate-500">
          Relabels the result instantly — no re-mining.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-800 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-2 py-2">Size</th>
              <th className="px-2 py-2">WPI</th>
              <th className="px-2 py-2">Features · participating instances</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((pattern) => (
              <tr
                key={pattern.pattern_index}
                onClick={() => onSelect(pattern)}
                className={`cursor-pointer border-t border-slate-700/60 hover:bg-slate-700/40 ${
                  pattern.pattern_index === selectedIndex ? 'bg-slate-700/60' : ''
                }`}
              >
                <td className="px-2 py-2 align-top font-mono text-xs text-slate-400">
                  {pattern.size}
                </td>
                <td className="px-2 py-2 align-top">
                  <PatternWpi pattern={pattern} />
                </td>
                <td className="px-2 py-2">
                  <PatternFeatures
                    pattern={pattern}
                    rareFeatures={result.rare_features}
                    colors={colors}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
          <button
            className="btn-secondary px-2 py-1 disabled:opacity-40"
            onClick={() => setPage(current - 1)}
            disabled={current === 0}
          >
            Previous
          </button>
          <span>
            Page {current + 1} of {pageCount}
          </span>
          <button
            className="btn-secondary px-2 py-1 disabled:opacity-40"
            onClick={() => setPage(current + 1)}
            disabled={current >= pageCount - 1}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
