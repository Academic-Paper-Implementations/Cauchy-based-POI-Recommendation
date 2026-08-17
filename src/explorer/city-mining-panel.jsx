import {
  EPS_MIN_M,
  EPS_MAX_M,
  MIN_PREV_MIN,
  MIN_PREV_MAX,
  rangeError,
} from './mining-request';

const STAGE_LABELS = {
  load: 'Đang tải địa điểm…',
  neighbor_graph: 'Tìm các nơi gần nhau…',
  maximal_clique: 'Nhóm các loại hình hay đi cùng…',
  mining: 'Đánh giá các nhóm…',
  export: 'Hoàn tất…',
  done: 'Xong',
};

export default function CityMiningPanel({
  datasets,
  selectedCity,
  onSelectCity,
  epsM,
  minPrev,
  onEps,
  onMinPrev,
  onRun,
  onCancel,
  running,
  job,
  jobError,
  hasResult,
}) {
  const epsError = rangeError(epsM, EPS_MIN_M, EPS_MAX_M);
  const minPrevError = rangeError(minPrev, MIN_PREV_MIN, MIN_PREV_MAX);
  const hasValidationError = Boolean(epsError || minPrevError);
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="city" className="mb-1 block text-sm text-slate-300">
          Thành phố
        </label>
        <select
          id="city"
          value={selectedCity || ''}
          onChange={(event) => onSelectCity(event.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
        >
          <option value="" disabled>
            Chọn thành phố…
          </option>
          {datasets.map((dataset) => (
            <option key={dataset.id} value={dataset.id}>
              {dataset.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="eps" className="mb-1 block text-sm text-slate-300">
            Khoảng cách (m)
          </label>
          <input
            id="eps"
            type="number"
            min={EPS_MIN_M}
            max={EPS_MAX_M}
            step={10}
            value={epsM}
            onChange={(event) => onEps(Number(event.target.value))}
            className={`w-full rounded-md border bg-slate-800 px-3 py-2 text-sm text-slate-100 ${
              epsError ? 'border-rose-500' : 'border-slate-700'
            }`}
          />
          {epsError && <p className="mt-1 text-xs text-rose-400">{epsError}</p>}
        </div>
        <div>
          <label htmlFor="minprev" className="mb-1 block text-sm text-slate-300">
            Độ phổ biến (0–1)
          </label>
          <input
            id="minprev"
            type="number"
            min={MIN_PREV_MIN}
            max={MIN_PREV_MAX}
            step={0.05}
            value={minPrev}
            onChange={(event) => onMinPrev(Number(event.target.value))}
            className={`w-full rounded-md border bg-slate-800 px-3 py-2 text-sm text-slate-100 ${
              minPrevError ? 'border-rose-500' : 'border-slate-700'
            }`}
          />
          {minPrevError && <p className="mt-1 text-xs text-rose-400">{minPrevError}</p>}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRun}
          disabled={!selectedCity || running || hasValidationError}
          className="flex-1 rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-sky-400 disabled:opacity-40"
        >
          {running ? 'Đang tìm…' : hasResult ? 'Tìm lại' : 'Tìm nơi hay đi cùng'}
        </button>
        {running && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-600"
          >
            Hủy
          </button>
        )}
      </div>

      {running && job?.stage && (
        <p className="text-sm text-slate-400">
          {STAGE_LABELS[job.stage] || job.stage}
          {job.elapsed_s != null && ` — ${job.elapsed_s.toFixed(1)}s`}
        </p>
      )}
      {jobError && <p className="text-sm text-rose-400">{jobError}</p>}
      <p className="text-xs text-slate-500">
        Tìm kiếm có thể mất vài phút với thành phố lớn; kết quả được lưu cache,
        lần sau cùng cài đặt sẽ trả về ngay.
      </p>
    </div>
  );
}
