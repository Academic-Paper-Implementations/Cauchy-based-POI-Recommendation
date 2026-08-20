import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../config/api';

// The mining job's whole life: submit, poll, load the result, and relabel it as
// the rare threshold moves. Pulled out of the component so the poll state
// machine can be tested without rendering anything.

const POLL_MS = 1000;
// A single dropped poll says nothing — the run is on the server and survives a
// blip. Only a run of failures is worth telling the user about.
const POLL_FAILURES_BEFORE_WARNING = 3;
// Long enough that dragging the slider does not fire a request per step, short
// enough that letting go feels immediate.
const RARE_DEBOUNCE_MS = 200;

export const RARE_MIN_COUNT = 30;
export const DEFAULT_RARE_PERCENTILE = 25;

export const isActive = (job) => job && (job.status === 'running' || job.status === 'queued');

export function useMiningJob() {
  const [job, setJob] = useState(null);
  const [jobError, setJobError] = useState('');
  const [pollError, setPollError] = useState('');
  const [result, setResult] = useState(null);
  const [rarePercentile, setRarePercentile] = useState(DEFAULT_RARE_PERCENTILE);
  // The threshold the loaded result was actually labelled with. It trails
  // `rarePercentile` while the slider is moving, and anything derived from the
  // result has to follow this one instead of the slider.
  const [appliedPercentile, setAppliedPercentile] = useState(DEFAULT_RARE_PERCENTILE);

  // Event handlers need the current job without being rebuilt on every poll tick.
  const jobRef = useRef(null);
  useEffect(() => {
    jobRef.current = job;
  }, [job]);
  const pollFailuresRef = useRef(0);
  const rareTimerRef = useRef(null);
  const rareTokenRef = useRef(0);
  const rareAbortRef = useRef(null);

  const cancelPendingRare = useCallback(() => {
    clearTimeout(rareTimerRef.current);
    rareAbortRef.current?.abort();
    rareAbortRef.current = null;
  }, []);

  const loadResult = useCallback(async (jobId, percentile) => {
    const body = await api.result(jobId, {
      rarePercentile: percentile,
      rareMinCount: RARE_MIN_COUNT,
    });
    setResult(body);
    setAppliedPercentile(percentile);
  }, []);

  // Poll while a job is in flight; the miner reports stages, not percentages.
  useEffect(() => {
    if (!isActive(job)) return undefined;
    const timer = setInterval(async () => {
      try {
        const next = await api.job(job.job_id);
        pollFailuresRef.current = 0;
        setPollError('');
        setJob(next);
        if (next.status === 'done') await loadResult(next.job_id, rarePercentile);
      } catch (error) {
        pollFailuresRef.current += 1;
        if (pollFailuresRef.current >= POLL_FAILURES_BEFORE_WARNING) {
          setPollError(`Lost contact with the server (${error.message}). Still retrying.`);
        }
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [job, rarePercentile, loadResult]);

  useEffect(() => cancelPendingRare, [cancelPendingRare]);

  const run = useCallback(
    async (request) => {
      setJobError('');
      setPollError('');
      pollFailuresRef.current = 0;
      setResult(null);
      try {
        const created = await api.createJob(request);
        setJob(created);
        if (created.status === 'done') await loadResult(created.job_id, rarePercentile);
        if (created.status === 'failed') setJobError(created.error);
      } catch (error) {
        setJobError(error.message);
      }
    },
    [loadResult, rarePercentile]
  );

  const cancel = useCallback(async () => {
    if (!jobRef.current) return;
    try {
      setJob(await api.cancelJob(jobRef.current.job_id));
    } catch (error) {
      setJobError(error.message);
    }
  }, []);

  /** Move the rare threshold: instant on screen, one request after the drag. */
  const changeRarePercentile = useCallback((value) => {
    setRarePercentile(value);
    const current = jobRef.current;
    if (!current || current.status !== 'done') return;

    cancelPendingRare();
    rareTimerRef.current = setTimeout(() => {
      // A request that has already been overtaken must not write its answer:
      // aborting stops the work, and the token stops a response that raced past
      // the abort from replacing a newer one.
      const token = (rareTokenRef.current += 1);
      const controller = new AbortController();
      rareAbortRef.current = controller;

      api
        .result(
          current.job_id,
          { rarePercentile: value, rareMinCount: RARE_MIN_COUNT },
          { signal: controller.signal }
        )
        .then((body) => {
          if (token !== rareTokenRef.current) return;
          setResult(body);
          setAppliedPercentile(value);
        })
        .catch((error) => {
          if (error.name === 'AbortError' || token !== rareTokenRef.current) return;
          setJobError(error.message);
        });
    }, RARE_DEBOUNCE_MS);
  }, [cancelPendingRare]);

  /** Forget the current job — the dataset it was mined from is no longer selected. */
  const reset = useCallback(() => {
    cancelPendingRare();
    rareTokenRef.current += 1;
    setJob(null);
    setResult(null);
    setJobError('');
    setPollError('');
  }, [cancelPendingRare]);

  return {
    job,
    jobError,
    pollError,
    result,
    rarePercentile,
    appliedPercentile,
    running: isActive(job),
    run,
    cancel,
    changeRarePercentile,
    reset,
  };
}
