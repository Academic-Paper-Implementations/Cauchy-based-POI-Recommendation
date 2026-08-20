import { useState } from 'react';

function ratingLabel(poi) {
  if (poi.stars === null || poi.stars === undefined) return '';
  return ` · ★ ${poi.stars.toFixed(1)}`;
}

function PoiRow({ poi, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(poi)}
      className={`flex w-full items-baseline justify-between gap-2 rounded px-2 py-1 text-left text-sm hover:bg-slate-700/60 ${
        selected ? 'bg-slate-700/60' : ''
      }`}
    >
      <span className="truncate text-slate-200">{poi.name || poi.id}</span>
      <span className="shrink-0 text-xs text-slate-400">
        {Math.round(poi.distance_m)} m{ratingLabel(poi)}
      </span>
    </button>
  );
}

function sortItems(items, sortBy, dir) {
  const sorted = [...items];
  if (sortBy === 'rating') {
    sorted.sort((a, b) =>
      dir === 'desc'
        ? (b.stars ?? 0) - (a.stars ?? 0)
        : (a.stars ?? 0) - (b.stars ?? 0)
    );
  } else {
    sorted.sort((a, b) =>
      dir === 'asc'
        ? a.distance_m - b.distance_m
        : b.distance_m - a.distance_m
    );
  }
  return sorted;
}

export default function NearbyList({
  tier1,
  tier2,
  noPatternsAtAll,
  onSelectPoi,
  selectedId,
}) {
  const [sortBy, setSortBy] = useState('distance');
  const [dir, setDir] = useState('asc');

  const handleSort = (field) => {
    if (sortBy === field) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setDir(field === 'distance' ? 'asc' : 'desc');
    }
  };

  const sortedTier1 = sortItems(tier1, sortBy, dir);
  const sortedTier2 = sortItems(tier2.items, sortBy, dir);

  const isEmpty = tier1.length === 0 && tier2.items.length === 0;

  if (isEmpty) {
    return (
      <p className="text-sm text-slate-500">
        {noPatternsAtAll
          ? 'No places found in this radius.'
          : 'No places in radius. Try expanding.'}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2 text-xs">
        <span className="text-slate-500">Sort:</span>
        <button
          type="button"
          onClick={() => handleSort('distance')}
          className={`rounded px-2 py-0.5 ${
            sortBy === 'distance' ? 'bg-slate-700 text-slate-200' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Distance {sortBy === 'distance' && (dir === 'asc' ? '↑' : '↓')}
        </button>
        <button
          type="button"
          onClick={() => handleSort('rating')}
          className={`rounded px-2 py-0.5 ${
            sortBy === 'rating' ? 'bg-slate-700 text-slate-200' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Rating {sortBy === 'rating' && (dir === 'asc' ? '↑' : '↓')}
        </button>
      </div>

      {sortedTier1.length > 0 && (
        <div className="rounded-lg border border-sky-800/50 bg-slate-800/60 p-3">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-sky-400">
            Co-located places
          </h4>
          <ul className="space-y-1">
            {sortedTier1.map((poi) => (
              <li key={poi.id}>
                <PoiRow
                  poi={poi}
                  selected={selectedId === poi.id}
                  onSelect={onSelectPoi}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {sortedTier2.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Other nearby
          </h4>
          <ul className="space-y-1">
            {sortedTier2.map((poi) => (
              <li key={poi.id}>
                <PoiRow
                  poi={poi}
                  selected={selectedId === poi.id}
                  onSelect={onSelectPoi}
                />
              </li>
            ))}
          </ul>
          {tier2.total > tier2.items.length && (
            <p className="mt-2 text-xs text-slate-500">
              Showing {tier2.items.length}/{tier2.total} — expand radius to see more.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
