import { useMemo } from 'react';
import { PatternFeatures, PatternWpi } from './pattern-list';

// The evidence behind one recommendation. Investor view hides the algorithm's
// vocabulary by default, but never removes it: every row can be opened to show
// the prevalent patterns that produced its score, with the same WPI and deduced
// markers the Mining view prints — so a number here can be checked against the
// full pattern table rather than taken on trust.

export default function SupportingPatterns({ patterns, total, rareFeatures, colors }) {
  const rare = useMemo(() => new Set(rareFeatures), [rareFeatures]);

  if (!patterns?.length) {
    return (
      <p className="text-xs text-slate-500">
        Không có pattern nào đủ thành viên trong bán kính ε ở đây.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded border border-slate-700 bg-slate-900/50 p-2">
      <p className="text-xs text-slate-400">
        {patterns.length.toLocaleString()}
        {total > patterns.length ? ` / ${total.toLocaleString()}` : ''} pattern hỗ trợ — mỗi
        pattern có đủ các thành viên còn lại trong bán kính ε.
      </p>
      {patterns.map((pattern) => (
        <div
          key={pattern.pattern_index}
          className="flex items-start justify-between gap-3 border-t border-slate-700/60 pt-1"
        >
          <PatternFeatures pattern={pattern} rare={rare} colors={colors} />
          <PatternWpi pattern={pattern} />
        </div>
      ))}
    </div>
  );
}
