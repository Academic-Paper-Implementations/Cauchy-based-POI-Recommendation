import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import FeatureRecommendations from './feature-recommendations';

const INSTANCE = { feature: 'Restaurants', number: 1, id: 'biz-1' };

const RECOMMENDATIONS = [
  {
    feature: 'American (New)',
    score: 2.9357,
    ready_count: 9,
    total_count: 9,
    existing_nearby: 0,
    is_rare: true,
    supporting_patterns: [
      {
        pattern_index: 4,
        features: ['American (New)', 'Restaurants'],
        size: 2,
        wpi: 0.6484,
        deduced: false,
        weight: 0.6484,
        participation_counts: { 'American (New)': 28, Restaurants: 1933 },
      },
    ],
  },
  {
    feature: 'Beauty & Spas',
    score: 2.4935,
    ready_count: 9,
    total_count: 18,
    existing_nearby: 3,
    is_rare: false,
    supporting_patterns: [
      {
        pattern_index: 7,
        features: ['Beauty & Spas', 'Restaurants'],
        size: 2,
        wpi: null,
        deduced: true,
        weight: 0.2,
        participation_counts: { 'Beauty & Spas': 40, Restaurants: 900 },
      },
    ],
  },
];

const panel = (props) =>
  render(
    <FeatureRecommendations
      instance={INSTANCE}
      recommendations={RECOMMENDATIONS}
      loading={false}
      error=""
      rareFeatures={['American (New)']}
      colors={{}}
      {...props}
    />
  );

describe('feature recommendations', () => {
  it('asks for a point before anything is selected', () => {
    panel({ instance: null });
    expect(screen.getByText(/Click một điểm trên bản đồ/)).toBeInTheDocument();
  });

  it('lists candidates in the order given, with support and saturation', () => {
    panel();

    const rows = screen.getAllByRole('row').slice(1); // drop the header
    expect(within(rows[0]).getByText('American (New)')).toBeInTheDocument();
    expect(within(rows[0]).getByText('2.9357')).toBeInTheDocument();
    expect(within(rows[0]).getByText('9/9')).toBeInTheDocument();

    // Nine of eighteen patterns are ready here, and three of the candidate are
    // already inside epsilon — the difference between an opening and a crowd.
    expect(within(rows[1]).getByText('9/18')).toBeInTheDocument();
    expect(within(rows[1]).getByText('3')).toBeInTheDocument();
  });

  it('marks a rare candidate without recolouring its name', () => {
    panel();
    expect(screen.getByText('hiếm')).toBeInTheDocument();
  });

  it('keeps the algorithm vocabulary behind the reason expander', async () => {
    const user = userEvent.setup();
    panel();

    expect(screen.queryByText(/pattern hỗ trợ/)).not.toBeInTheDocument();

    const [firstReason] = screen.getAllByRole('button', { name: 'Lý do' });
    expect(firstReason).toHaveAttribute('aria-expanded', 'false');
    await user.click(firstReason);

    expect(firstReason).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/pattern hỗ trợ/)).toBeInTheDocument();
    // The supporting pattern contains both the clicked point's feature and the
    // candidate, and carries the WPI it was scored with.
    expect(screen.getByText('0.6484')).toBeInTheDocument();
    expect(screen.getByText('28')).toBeInTheDocument();
  });

  it('labels a pattern with no computed WPI as deduced', async () => {
    const user = userEvent.setup();
    panel();

    await user.click(screen.getAllByRole('button', { name: 'Lý do' })[1]);
    expect(screen.getByText('deduced')).toBeInTheDocument();
  });

  it('shows the error instead of an empty table', () => {
    panel({ recommendations: null, error: 'Chạy mining trước để có khuyến nghị.' });
    expect(screen.getByText(/Chạy mining trước/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
