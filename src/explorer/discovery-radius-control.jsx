// The "how far around here" control. It is a VIEW filter only: it narrows which
// nearby places are shown, and never re-runs mining. Co-location groups are
// defined by the mining neighbour distance (epsM); this radius can only narrow
// within that, never claim co-location past it — so the slider is clamped to
// epsM and the caption states both numbers honestly.

export const RADIUS_MIN_M = 20;

export default function DiscoveryRadiusControl({ radiusM, epsM, onChange, disabled }) {
  const max = Math.max(RADIUS_MIN_M, Math.round(epsM || RADIUS_MIN_M));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <label htmlFor="discovery-radius" className="text-slate-300">
          Around here
        </label>
        <span className="text-slate-400">{Math.round(radiusM)} m</span>
      </div>
      <input
        id="discovery-radius"
        type="range"
        min={RADIUS_MIN_M}
        max={max}
        step={5}
        value={Math.min(radiusM, max)}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-sky-400 disabled:opacity-40"
      />
      <p className="text-xs text-slate-500">
        Groups are formed within {Math.round(epsM || 0)} m (the search distance); showing
        places within {Math.round(radiusM)} m.
      </p>
    </div>
  );
}
