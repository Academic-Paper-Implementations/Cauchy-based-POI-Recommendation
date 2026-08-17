import { describeAttributes, todayHours } from './attributes';

// Detail card for one place: name, type, distance from the clicked spot, rating,
// and the attributes that are actually known. Missing details are simply left
// out — the card never claims a "No" for something the data does not record.

function Stars({ stars, reviewCount }) {
  if (stars === null || stars === undefined) {
    return <span className="text-slate-500">Chưa đánh giá</span>;
  }
  return (
    <span className="text-amber-300">
      ★ {stars.toFixed(1)}
      {reviewCount ? <span className="text-slate-500"> ({reviewCount})</span> : null}
    </span>
  );
}

function CoLocationLine({ tier1Info }) {
  if (!tier1Info) return null;
  const { patternFeatures, patternCount } = tier1Info;
  if (patternCount > 1) {
    return (
      <p className="mt-2 text-xs text-sky-400/80">
        Thuộc {patternCount} nhóm đồng vị
      </p>
    );
  }
  return (
    <p className="mt-2 text-xs text-sky-400/80">
      Đồng vị với {patternFeatures.join(' + ')}
    </p>
  );
}

export default function PoiPopup({ poi, tier1Info, onClose }) {
  if (!poi) return null;
  const chips = describeAttributes(poi.attributes);
  const hours = todayHours(poi.attributes?.hours);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/95 p-4 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-100">
            {poi.name || poi.id}
          </h3>
          <p className="text-sm text-slate-400">{poi.feature}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded px-2 text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Stars stars={poi.stars} reviewCount={poi.review_count} />
        {typeof poi.distance_m === 'number' && (
          <span className="text-slate-300">Cách {Math.round(poi.distance_m)} m</span>
        )}
        {hours && <span className="text-slate-400">Hôm nay {hours}</span>}
      </div>

      <CoLocationLine tier1Info={tier1Info} />

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full bg-slate-700/70 px-2 py-0.5 text-xs text-slate-200"
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
