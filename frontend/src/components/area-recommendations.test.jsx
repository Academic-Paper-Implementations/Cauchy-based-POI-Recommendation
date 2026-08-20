import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AreaRecommendations from './area-recommendations';

// Two regions that disagree: the first wins on peak, the second on total. Any
// ranking that collapses the two columns into one shows up here immediately.
const REGIONS = [
  {
    rank: 1,
    peak_score: 24.82,
    total_score: 120.5,
    cell_count: 4,
    saturation: 0,
    centroid: { x: 1000, y: 2000, lat: 39.9509, lon: -75.1641 },
    bbox: { x_min: 0, y_min: 0, x_max: 100, y_max: 100 },
    supporting_pattern_count: 2,
    supporting_patterns: [
      {
        pattern_index: 1,
        features: ['Pizza', 'Restaurants'],
        size: 2,
        wpi: 0.51,
        deduced: false,
        weight: 0.51,
        participation_counts: { Pizza: 120, Restaurants: 1933 },
      },
    ],
  },
  {
    rank: 2,
    peak_score: 12.4,
    total_score: 3270.46,
    cell_count: 200,
    saturation: 281,
    centroid: { x: 5000, y: 6000, lat: 39.9414, lon: -75.1507 },
    bbox: { x_min: 0, y_min: 0, x_max: 100, y_max: 100 },
    supporting_pattern_count: 1,
    supporting_patterns: [],
  },
];

const panel = (props) =>
  render(
    <AreaRecommendations
      features={['Pizza', 'Restaurants']}
      feature="Pizza"
      onFeatureChange={vi.fn()}
      regions={REGIONS}
      loading={false}
      error=""
      onFocusRegion={vi.fn()}
      rareFeatures={[]}
      colors={{}}
      {...props}
    />
  );

const dataRows = () => screen.getAllByRole('row').slice(1);

describe('area recommendations', () => {
  it('ranks by peak by default', () => {
    panel();

    const first = dataRows()[0];
    expect(within(first).getByText('24.82')).toBeInTheDocument();
    expect(within(first).getByText('4')).toBeInTheDocument();
    // The high-total region is second, not first.
    expect(within(first).queryByText('281')).toBeNull();
  });

  it('reorders when the total column is chosen', async () => {
    const user = userEvent.setup();
    panel();

    await user.click(screen.getByRole('button', { name: /Tổng/ }));

    // The large diffuse region now leads, which is the whole reason both
    // columns are shown.
    const first = dataRows()[0];
    expect(within(first).getByText('3270.46')).toBeInTheDocument();
    expect(within(first).getByText('200')).toBeInTheDocument();
    expect(within(first).getByText('281')).toBeInTheDocument();
  });

  it('flies to a region when its row is activated by keyboard', async () => {
    const user = userEvent.setup();
    const onFocusRegion = vi.fn();
    panel({ onFocusRegion });

    dataRows()[0].focus();
    await user.keyboard('{Enter}');

    expect(onFocusRegion).toHaveBeenCalledWith(expect.objectContaining({ rank: 1 }));
  });

  it('labels a region by its degrees when the dataset has them', () => {
    panel();
    expect(screen.getByText('39.9509, -75.1641')).toBeInTheDocument();
  });

  it('falls back to metres for a dataset with no degrees', () => {
    const metresOnly = [{ ...REGIONS[0], centroid: { x: 1250, y: 640 } }];
    panel({ regions: metresOnly });
    expect(screen.getByText('1,250 m, 640 m')).toBeInTheDocument();
  });

  it('explains an empty answer instead of showing a bare table', () => {
    panel({ regions: [] });
    expect(screen.getByText(/Không có pattern prevalent nào/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('associates the feature picker with its label', () => {
    panel();
    expect(screen.getByLabelText('Feature muốn mở')).toHaveValue('Pizza');
  });
});
