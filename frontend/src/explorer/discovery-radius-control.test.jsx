import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DiscoveryRadiusControl from './discovery-radius-control.jsx';
import { RADIUS_MAX_M } from '../utils/map-helpers';

describe('DiscoveryRadiusControl', () => {
  it('allows slider up to RADIUS_MAX_M (1.5km) for tier-2 discovery', () => {
    render(<DiscoveryRadiusControl radiusM={80} epsM={100} onChange={() => {}} />);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('max')).toBe(String(RADIUS_MAX_M));
    expect(slider.value).toBe('80');
  });

  it('clamps slider value to RADIUS_MAX_M when exceeding ceiling', () => {
    render(<DiscoveryRadiusControl radiusM={2000} epsM={100} onChange={() => {}} />);
    expect(screen.getByRole('slider').value).toBe(String(RADIUS_MAX_M));
  });

  it('displays the radius value in the label', () => {
    render(<DiscoveryRadiusControl radiusM={60} epsM={100} onChange={() => {}} />);
    expect(screen.getByText('60 m')).toBeInTheDocument();
  });
});
