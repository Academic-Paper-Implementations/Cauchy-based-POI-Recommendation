import { useState } from 'react';
import { featureColor } from '../utils/feature-colors';
import SupportingPatterns from './supporting-patterns';

// "What should go here?" — the features whose remaining pattern members are
// already within epsilon of the clicked point. Score is the summed WPI of those
// ready patterns, so it is a measure of co-location support and nothing more;
// the "Đã có" column shows how much of the candidate is there already, which is
// what separates an opportunity from a crowded corner.

export default function FeatureRecommendations({
  instance,
  recommendations,
  loading,
  error,
  rareFeatures,
  colors,
}) {
  const [openFeature, setOpenFeature] = useState(null);

  if (!instance) {
    return (
      <div className="card h-full p-4 text-sm text-slate-400">
        Click một điểm trên bản đồ để xem nên đầu tư feature nào ở đó.
      </div>
    );
  }

  const rare = new Set(rareFeatures);
  const rows = recommendations ?? [];

  return (
    <div className="card flex h-full min-h-0 flex-col p-4">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-primary-400">Nên đầu tư gì ở đây</h2>
        <p className="font-mono text-xs text-slate-500">
          {instance.feature} · {instance.number} — {instance.id}
        </p>
      </div>

      {loading && <p className="text-sm text-slate-400">Đang tính khuyến nghị…</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}

      {!loading && !error && (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-800 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-2 py-2">Feature</th>
                <th className="px-2 py-2">Score</th>
                <th className="px-2 py-2" title="Số pattern đủ thành viên / tổng số pattern chứa cả hai feature">
                  Hỗ trợ
                </th>
                <th className="px-2 py-2" title="Số instance của feature này đã có trong bán kính ε">
                  Đã có
                </th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row
                  key={row.feature}
                  row={row}
                  colors={colors}
                  isRare={rare.has(row.feature)}
                  rareFeatures={rareFeatures}
                  open={openFeature === row.feature}
                  onToggle={() =>
                    setOpenFeature((current) => (current === row.feature ? null : row.feature))
                  }
                />
              ))}
            </tbody>
          </table>

          {rows.length === 0 && (
            <p className="text-sm text-slate-400">
              Không có feature nào được pattern hỗ trợ tại điểm này.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ row, colors, isRare, rareFeatures, open, onToggle }) {
  return (
    <>
      <tr className="border-t border-slate-700/60">
        <td className="px-2 py-2">
          <span style={{ color: featureColor(colors, row.feature) }}>{row.feature}</span>
          {/* Same convention as the pattern table: red marks rarity, never a name. */}
          {isRare && <span className="ml-1 text-xs font-semibold text-red-400">hiếm</span>}
        </td>
        <td className="px-2 py-2 font-mono text-xs text-slate-200">{row.score.toFixed(4)}</td>
        <td className="px-2 py-2 font-mono text-xs text-slate-400">
          {row.ready_count}/{row.total_count}
        </td>
        <td className="px-2 py-2 font-mono text-xs text-slate-400">
          {row.existing_nearby.toLocaleString()}
        </td>
        <td className="px-2 py-2 text-right">
          <button
            type="button"
            className="btn-secondary px-2 py-0.5 text-xs"
            aria-expanded={open}
            onClick={onToggle}
          >
            Lý do
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="px-2 pb-3">
            <SupportingPatterns
              patterns={row.supporting_patterns}
              total={row.total_count}
              rareFeatures={rareFeatures}
              colors={colors}
            />
          </td>
        </tr>
      )}
    </>
  );
}
