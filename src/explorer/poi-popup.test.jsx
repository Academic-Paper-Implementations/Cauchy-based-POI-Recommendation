import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PoiPopup from './poi-popup.jsx';

describe('PoiPopup', () => {
  it('shows name, rating, distance and known attributes', () => {
    render(
      <PoiPopup
        poi={{
          id: 'b1', name: 'Bar One', feature: 'Italian', stars: 4, review_count: 80,
          distance_m: 42.7, attributes: { takeout: 'true' },
        }}
      />
    );
    expect(screen.getByText('Bar One')).toBeInTheDocument();
    expect(screen.getByText(/4\.0/)).toBeInTheDocument();
    expect(screen.getByText(/Cách 43 m/)).toBeInTheDocument();
    expect(screen.getByText('Mang đi')).toBeInTheDocument();
  });

  it('shows "Chưa đánh giá" for missing stars and never renders a missing attribute as "Không"', () => {
    render(
      <PoiPopup
        poi={{
          id: 'b2', name: 'Cafe', feature: 'Coffee & Tea', stars: null,
          attributes: { takeout: null, delivery: '' },
        }}
      />
    );
    expect(screen.getByText('Chưa đánh giá')).toBeInTheDocument();
    expect(screen.queryByText(/Không mang đi/)).toBeNull();
    expect(screen.queryByText(/Không giao hàng/)).toBeNull();
  });
});
