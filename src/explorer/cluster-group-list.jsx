// Co-located groups around the clicked place. Each group is one mined pattern,
// shown as a plain feature list ("Wine Bars + Tapas + Gelato") — the ranking
// engine (rare/WPI/kappa) stays hidden. Members are the nearby places that
// participate in that group, within the current discovery radius.

function ratingLabel(poi) {
  if (poi.stars === null || poi.stars === undefined) return '';
  return ` · ★ ${poi.stars.toFixed(1)}`;
}

export default function ClusterGroupList({ groups, noPatternsAtAll, onSelectPoi, selectedId }) {
  if (!groups.length) {
    return (
      <p className="text-sm text-slate-500">
        {noPatternsAtAll
          ? 'This place is not part of any co-located group here.'
          : 'No co-located places within this radius. Try widening it.'}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div
          key={group.features.join('|')}
          className="rounded-lg border border-slate-700 bg-slate-800/60 p-3"
        >
          <h4 className="text-sm font-medium text-slate-200">
            {group.features.join(' + ')}
          </h4>
          <ul className="mt-2 space-y-1">
            {group.members.map((poi) => (
              <li key={`${poi.feature} ${poi.number}`}>
                <button
                  type="button"
                  onClick={() => onSelectPoi(poi)}
                  className={`flex w-full items-baseline justify-between gap-2 rounded px-2 py-1 text-left text-sm hover:bg-slate-700/60 ${
                    selectedId === poi.id ? 'bg-slate-700/60' : ''
                  }`}
                >
                  <span className="truncate text-slate-200">{poi.name || poi.id}</span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {Math.round(poi.distance_m)} m{ratingLabel(poi)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
