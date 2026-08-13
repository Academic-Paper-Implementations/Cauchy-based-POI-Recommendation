import { useState } from 'react';
import SupportingPatterns from './supporting-patterns';

// "Where should this feature go?" — every occupied epsilon-cell is scored by the
// patterns it already satisfies, and contiguous high-scoring cells are merged
// into regions.
//
// Regions are ranked by their **peak** cell by default, which favours a sharp
// opportunity; the total and the cell count are shown next to it because a large
// diffuse area and a single strong block are different propositions, and sorting
// by Tổng puts the other one first.

const SORTS = {
  peak: (a, b) => b.peak_score - a.peak_score,
  total: (a, b) => b.total_score - a.total_score,
};

const regionLabel = (region) =>
  region.centroid.lat !== undefined
    ? `${region.centroid.lat.toFixed(4)}, ${region.centroid.lon.toFixed(4)}`
    : `${Math.round(region.centroid.x).toLocaleString()} m, ${Math.round(
        region.centroid.y
      ).toLocaleString()} m`;

export default function AreaRecommendations({
  features,
  feature,
  onFeatureChange,
  regions,
  loading,
  error,
  onFocusRegion,
  rareFeatures,
  colors,
}) {
  const [sort, setSort] = useState('peak');
  const [openRank, setOpenRank] = useState(null);

  const rows = regions ? [...regions].sort(SORTS[sort]) : [];

  return (
    <div className="card flex h-full min-h-0 flex-col p-4">
      <h2 className="mb-3 text-lg font-semibold text-primary-400">
        Chọn feature → khu vực phù hợp
      </h2>

      <div className="mb-3">
        <label htmlFor="area-feature" className="mb-1 block text-xs text-slate-400">
          Feature muốn mở
        </label>
        <select
          id="area-feature"
          className="select-field w-full"
          value={feature}
          onChange={(event) => onFeatureChange(event.target.value)}
        >
          <option value="">— chọn một feature —</option>
          {features.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-sm text-slate-400">Đang chấm điểm khu vực…</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}

      {!loading && !error && feature && rows.length === 0 && (
        <p className="text-sm text-slate-400">
          Không có pattern prevalent nào chứa feature này, nên không có khu vực nào để xếp hạng.
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-800 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Vùng</th>
                <SortHeader label="Peak" active={sort === 'peak'} onClick={() => setSort('peak')} />
                <SortHeader
                  label="Tổng"
                  active={sort === 'total'}
                  onClick={() => setSort('total')}
                />
                <th className="px-2 py-2">Ô</th>
                <th className="px-2 py-2" title="Số instance của feature này đã có trong vùng">
                  Đã có
                </th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((region) => (
                <RegionRow
                  key={region.rank}
                  region={region}
                  colors={colors}
                  rareFeatures={rareFeatures}
                  open={openRank === region.rank}
                  onToggle={() =>
                    setOpenRank((current) => (current === region.rank ? null : region.rank))
                  }
                  onFocus={() => onFocusRegion(region)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SortHeader({ label, active, onClick }) {
  return (
    <th className="px-2 py-2">
      <button
        type="button"
        onClick={onClick}
        aria-sort={active ? 'descending' : 'none'}
        className={active ? 'text-primary-400' : 'hover:text-slate-200'}
      >
        {label} {active ? '↓' : ''}
      </button>
    </th>
  );
}

function RegionRow({ region, colors, rareFeatures, open, onToggle, onFocus }) {
  return (
    <>
      <tr
        tabIndex={0}
        onClick={onFocus}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onFocus();
          }
        }}
        className="cursor-pointer border-t border-slate-700/60 hover:bg-slate-700/40"
      >
        <td className="px-2 py-2 font-mono text-xs text-slate-500">{region.rank}</td>
        <td className="px-2 py-2 font-mono text-xs text-slate-300">{regionLabel(region)}</td>
        <td className="px-2 py-2 font-mono text-xs text-slate-200">
          {region.peak_score.toFixed(2)}
        </td>
        <td className="px-2 py-2 font-mono text-xs text-slate-400">
          {region.total_score.toFixed(2)}
        </td>
        <td className="px-2 py-2 font-mono text-xs text-slate-400">{region.cell_count}</td>
        <td className="px-2 py-2 font-mono text-xs text-slate-400">
          {region.saturation.toLocaleString()}
        </td>
        <td className="px-2 py-2 text-right">
          <button
            type="button"
            className="btn-secondary px-2 py-0.5 text-xs"
            aria-expanded={open}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            Lý do
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="px-2 pb-3">
            <SupportingPatterns
              patterns={region.supporting_patterns}
              total={region.supporting_pattern_count}
              rareFeatures={rareFeatures}
              colors={colors}
            />
          </td>
        </tr>
      )}
    </>
  );
}
