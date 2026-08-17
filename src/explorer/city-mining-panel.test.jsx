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
  hasResult: false,
};

describe('CityMiningPanel', () => {
  it('shows inline error and disables Run when eps out of range', () => {
    render(<CityMiningPanel {...baseProps} epsM={500} />);
    expect(screen.getByText(/Tối đa 300/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tìm nơi hay đi cùng/ })).toBeDisabled();
  });

  it('shows inline error and disables Run when minPrev out of range', () => {
    render(<CityMiningPanel {...baseProps} minPrev={1.5} />);
    expect(screen.getByText(/Tối đa 1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tìm nơi hay đi cùng/ })).toBeDisabled();
  });

  it('enables Run when both inputs are valid', () => {
    render(<CityMiningPanel {...baseProps} epsM={100} minPrev={0.2} />);
    expect(screen.getByRole('button', { name: /Tìm nơi hay đi cùng/ })).not.toBeDisabled();
  });

  it('shows Cancel button only while running', () => {
    const { rerender } = render(<CityMiningPanel {...baseProps} running={false} />);
    expect(screen.queryByRole('button', { name: /Hủy/ })).not.toBeInTheDocument();

    rerender(<CityMiningPanel {...baseProps} running={true} />);
    expect(screen.getByRole('button', { name: /Hủy/ })).toBeInTheDocument();
  });

  it('calls onCancel when Cancel button is clicked', async () => {
    const onCancel = vi.fn();
    render(<CityMiningPanel {...baseProps} running={true} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /Hủy/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows stage label and elapsed time while running', () => {
    render(
      <CityMiningPanel
        {...baseProps}
        running={true}
        job={{ stage: 'mining', elapsed_s: 12.345 }}
      />
    );
    expect(screen.getByText(/Đánh giá các nhóm…/)).toBeInTheDocument();
    expect(screen.getByText(/12\.3s/)).toBeInTheDocument();
  });
});
