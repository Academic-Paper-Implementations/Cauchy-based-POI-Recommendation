// Base URL for the co-location mining backend (FastAPI).
// Empty by default: calls are same-origin relative URLs. In dev the Vite proxy
// forwards /api to the backend; in production FastAPI serves the built app and
// the API from the same origin. Override only for a cross-origin backend.
export const API_BASE = import.meta.env.VITE_API_BASE || '';

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      /* keep the status text */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

const query = (params) =>
  Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

export const api = {
  health: () => request('/api/health'),

  datasets: () => request('/api/datasets'),

  instances: (datasetId) => request(`/api/datasets/${encodeURIComponent(datasetId)}/instances`),

  createJob: (body) =>
    request('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  job: (jobId) => request(`/api/jobs/${jobId}`),

  cancelJob: (jobId) => request(`/api/jobs/${jobId}`, { method: 'DELETE' }),

  // Rare labelling is applied here, at read time — moving the threshold costs
  // one request and never re-runs the miner.
  result: (jobId, { rarePercentile, rareMinCount }) =>
    request(
      `/api/jobs/${jobId}/result?${query({
        rare_percentile: rarePercentile,
        rare_min_count: rareMinCount,
      })}`
    ),

  instancePatterns: (jobId, feature, number, { rarePercentile, rareMinCount }) =>
    request(
      `/api/jobs/${jobId}/instances/${encodeURIComponent(feature)}/${number}?${query({
        rare_percentile: rarePercentile,
        rare_min_count: rareMinCount,
      })}`
    ),

  uploadDataset: (formData) =>
    request('/api/uploads', { method: 'POST', body: formData }),

  clearCache: () => request('/api/cache', { method: 'DELETE' }),
};
