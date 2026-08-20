import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMiningJob } from './use-mining-job';
import { api } from '../config/api';

vi.mock('../config/api', () => ({
  api: {
    createJob: vi.fn(),
    job: vi.fn(),
    cancelJob: vi.fn(),
    result: vi.fn(),
  },
}));

const RESULT = { pattern_count: 3, patterns: [], rare_features: [] };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Submit a job and settle the initial render. */
async function start(hook, created) {
  api.createJob.mockResolvedValue(created);
  await act(async () => {
    await hook.result.current.run({ dataset_id: 'd' });
  });
}

describe('poll state machine', () => {
  it('polls a running job until it is done, then loads the result', async () => {
    api.job
      .mockResolvedValueOnce({ job_id: 'j1', status: 'running' })
      .mockResolvedValueOnce({ job_id: 'j1', status: 'done' });
    api.result.mockResolvedValue(RESULT);

    const hook = renderHook(() => useMiningJob());
    await start(hook, { job_id: 'j1', status: 'running' });

    expect(hook.result.current.running).toBe(true);
    expect(hook.result.current.result).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(hook.result.current.running).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(hook.result.current.running).toBe(false);
    expect(hook.result.current.result).toEqual(RESULT);

    // The interval must stop once the job is finished.
    api.job.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(api.job).not.toHaveBeenCalled();
  });

  it('loads the result immediately when the job comes back from cache', async () => {
    api.result.mockResolvedValue(RESULT);

    const hook = renderHook(() => useMiningJob());
    await start(hook, { job_id: 'j1', status: 'done', from_cache: true });

    expect(api.job).not.toHaveBeenCalled();
    expect(hook.result.current.result).toEqual(RESULT);
  });

  it('only warns after a run of failed polls, and clears on recovery', async () => {
    api.job.mockRejectedValue(new Error('network down'));

    const hook = renderHook(() => useMiningJob());
    await start(hook, { job_id: 'j1', status: 'running' });

    for (let tick = 0; tick < 2; tick += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    // Two dropped polls are not worth a message; the run is still on the server.
    expect(hook.result.current.pollError).toBe('');
    expect(hook.result.current.job.status).toBe('running');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(hook.result.current.pollError).toMatch(/Lost contact/);
    // The progress it was reporting is still there.
    expect(hook.result.current.job.status).toBe('running');

    api.job.mockResolvedValue({ job_id: 'j1', status: 'running' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(hook.result.current.pollError).toBe('');
  });

  it('reports a failed submission on the job channel', async () => {
    api.createJob.mockRejectedValue(new Error('400: bad epsilon'));

    const hook = renderHook(() => useMiningJob());
    await act(async () => {
      await hook.result.current.run({ dataset_id: 'd' });
    });

    expect(hook.result.current.jobError).toBe('400: bad epsilon');
    expect(hook.result.current.pollError).toBe('');
  });
});

describe('rare threshold', () => {
  async function doneJob() {
    api.result.mockResolvedValue(RESULT);
    const hook = renderHook(() => useMiningJob());
    await start(hook, { job_id: 'j1', status: 'done' });
    api.result.mockClear();
    return hook;
  }

  it('moves instantly on screen but issues one request per drag', async () => {
    const hook = await doneJob();

    act(() => {
      [30, 40, 50, 60].forEach((value) => hook.result.current.changeRarePercentile(value));
    });

    // The slider is at its final value straight away...
    expect(hook.result.current.rarePercentile).toBe(60);
    // ...and nothing has been requested yet.
    expect(api.result).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(api.result).toHaveBeenCalledTimes(1);
    expect(api.result.mock.calls[0][1].rarePercentile).toBe(60);
    expect(hook.result.current.appliedPercentile).toBe(60);
  });

  it('ignores a superseded response that arrives last', async () => {
    const hook = await doneJob();

    let resolveStale;
    api.result
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStale = resolve;
          })
      )
      .mockResolvedValueOnce({ ...RESULT, pattern_count: 222 });

    act(() => hook.result.current.changeRarePercentile(40));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    act(() => hook.result.current.changeRarePercentile(80));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(hook.result.current.result.pattern_count).toBe(222);
    expect(hook.result.current.appliedPercentile).toBe(80);

    // The first request finally answers — with an answer nobody wants any more.
    await act(async () => {
      resolveStale({ ...RESULT, pattern_count: 111 });
    });

    expect(hook.result.current.result.pattern_count).toBe(222);
    expect(hook.result.current.appliedPercentile).toBe(80);
  });

  it('does not request anything while there is no finished job', async () => {
    const hook = renderHook(() => useMiningJob());

    act(() => hook.result.current.changeRarePercentile(45));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(hook.result.current.rarePercentile).toBe(45);
    expect(api.result).not.toHaveBeenCalled();
  });
});
