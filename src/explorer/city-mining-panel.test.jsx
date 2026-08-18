import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CityMiningPanel from './city-mining-panel';

const datasets = [{ id: 'philly', label: 'Philadelphia' }];

const baseProps = {
  datasets,
  selectedCity: 'philly',
  onSelectCity: vi.fn(),
  epsM: 100,
  minPrev: 0.2,
  onEps: vi.fn(),
  onMinPrev: vi.fn(),
  onRun: vi.fn(),
  onCancel: vi.fn(),
  running: false,
  job: null,
  jobError: '',
  result: null,
};

describe('CityMiningPanel', () => {
  it('shows inline error and disables Run when eps out of range', () => {
    render(<CityMiningPanel {...baseProps} epsM={500} />);
    expect(screen.getByText(/Max 300/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Find co-located spots/ })).toBeDisabled();
  });

  it('shows inline error and disables Run when minPrev out of range', () => {
    render(<CityMiningPanel {...baseProps} minPrev={1.5} />);
    expect(screen.getByText(/Max 1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Find co-located spots/ })).toBeDisabled();
  });

  it('enables Run when both inputs are valid', () => {
    render(<CityMiningPanel {...baseProps} epsM={100} minPrev={0.2} />);
    expect(screen.getByRole('button', { name: /Find co-located spots/ })).not.toBeDisabled();
  });

  it('shows Cancel button only while running', () => {
    const { rerender } = render(<CityMiningPanel {...baseProps} running={false} />);
    expect(screen.queryByRole('button', { name: /Cancel/ })).not.toBeInTheDocument();

    rerender(<CityMiningPanel {...baseProps} running={true} />);
    expect(screen.getByRole('button', { name: /Cancel/ })).toBeInTheDocument();
  });

  it('calls onCancel when Cancel button is clicked', async () => {
    const onCancel = vi.fn();
    render(<CityMiningPanel {...baseProps} running={true} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows stage label and elapsed time while running', () => {
    render(
      <CityMiningPanel
        {...baseProps}
        running={true}
        job={{ status: 'running', stage: 'mining', stage_index: 3, stage_count: 6, elapsed_s: 12.345 }}
      />
    );
    expect(screen.getByText(/Evaluating groups…/)).toBeInTheDocument();
    expect(screen.getByText(/12\.3s/)).toBeInTheDocument();
  });

  it('shows progress bar at 100% when at export stage (real 6-stage shape)', () => {
    render(
      <CityMiningPanel
        {...baseProps}
        running={true}
        job={{ status: 'running', stage: 'export', stage_index: 4, stage_count: 6, elapsed_s: 30 }}
      />
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
  });

  it('shows progress bar at 60% when at mining stage (index 3 of 5 work stages)', () => {
    render(
      <CityMiningPanel
        {...baseProps}
        running={true}
        job={{ status: 'running', stage: 'mining', stage_index: 2, stage_count: 6, elapsed_s: 10 }}
      />
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '60');
  });

  it('shows success banner on done with group count', () => {
    render(
      <CityMiningPanel
        {...baseProps}
        running={false}
        job={{ status: 'done', params: { dataset_id: 'philly', eps_m: 100, min_prev: 0.2 } }}
        result={{ pattern_count: 37 }}
      />
    );
    expect(screen.getByText(/✓ Done — 37 groups found/)).toBeInTheDocument();
  });

  it('shows mined badge with city, ε, popularity and group count', () => {
    render(
      <CityMiningPanel
        {...baseProps}
        running={false}
        job={{ status: 'done', params: { dataset_id: 'philly', eps_m: 100, min_prev: 0.2 } }}
        result={{ pattern_count: 37 }}
      />
    );
    expect(screen.getByText(/Mined: Philadelphia · ε 100 m · popularity 0\.2 → 37 groups/)).toBeInTheDocument();
  });
});
