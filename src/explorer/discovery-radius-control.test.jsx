import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DiscoveryRadiusControl from './discovery-radius-control.jsx';

describe('DiscoveryRadiusControl', () => {
  it('clamps the slider maximum to the mined epsilon', () => {
    render(<DiscoveryRadiusControl radiusM={80} epsM={100} onChange={() => {}} />);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('max')).toBe('100');
    expect(slider.value).toBe('80');
  });

  it('never lets the slider value exceed epsilon', () => {
    render(<DiscoveryRadiusControl radiusM={250} epsM={100} onChange={() => {}} />);
    expect(screen.getByRole('slider').value).toBe('100');
  });

  it('states both the search distance and the view radius honestly', () => {
    render(<DiscoveryRadiusControl radiusM={60} epsM={100} onChange={() => {}} />);
    const caption = screen.getByText(/formed within/);
    expect(caption.textContent).toMatch(/within 100 m/);
    expect(caption.textContent).toMatch(/within 60 m/);
  });
});
