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
    expect(screen.getByText(/43 m away/)).toBeInTheDocument();
    expect(screen.getByText('Takeout')).toBeInTheDocument();
  });

  it('shows "Unrated" for missing stars and never renders a missing attribute as "No"', () => {
    render(
      <PoiPopup
        poi={{
          id: 'b2', name: 'Cafe', feature: 'Coffee & Tea', stars: null,
          attributes: { takeout: null, delivery: '' },
        }}
      />
    );
    expect(screen.getByText('Unrated')).toBeInTheDocument();
    expect(screen.queryByText(/No takeout/)).toBeNull();
    expect(screen.queryByText(/No delivery/)).toBeNull();
  });
});
