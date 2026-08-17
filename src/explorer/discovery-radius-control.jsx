import { RADIUS_MAX_M } from '../utils/map-helpers';

export const RADIUS_MIN_M = 20;

export default function DiscoveryRadiusControl({ radiusM, epsM, onChange, disabled }) {
  const max = RADIUS_MAX_M;
  const roundedEps = Math.round(epsM || 0);
  const roundedRadius = Math.round(radiusM);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <label htmlFor="discovery-radius" className="text-slate-300">
          Quanh đây
        </label>
        <span className="text-slate-400">{roundedRadius} m</span>
      </div>
      <input
        id="discovery-radius"
        type="range"
        min={RADIUS_MIN_M}
        max={max}
        step={10}
        value={Math.min(radiusM, max)}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-sky-400 disabled:opacity-40"
      />
      <p className="text-xs text-slate-500">
        Nhóm hình thành trong {roundedEps} m; đang hiện trong {roundedRadius} m.
      </p>
    </div>
  );
}
