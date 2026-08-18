import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NearbyList from './nearby-list.jsx';

const tier1 = [
  { id: 'a', name: 'Place A', distance_m: 50, stars: 4.5 },
  { id: 'b', name: 'Place B', distance_m: 100, stars: 3.0 },
  { id: 'c', name: 'Place C', distance_m: 75, stars: 5.0 },
];

const tier2 = { items: [], total: 0 };

describe('NearbyList sort toggle', () => {
  it('defaults to distance ascending with ↑ indicator', () => {
    render(<NearbyList tier1={tier1} tier2={tier2} onSelectPoi={() => {}} />);
    expect(screen.getByRole('button', { name: /Distance ↑/ })).toBeInTheDocument();
    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Place A');
    expect(items[1]).toHaveTextContent('Place C');
    expect(items[2]).toHaveTextContent('Place B');
  });

  it('flips distance to descending when clicked again', async () => {
    render(<NearbyList tier1={tier1} tier2={tier2} onSelectPoi={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Distance/ }));
    expect(screen.getByRole('button', { name: /Distance ↓/ })).toBeInTheDocument();
    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Place B');
    expect(items[2]).toHaveTextContent('Place A');
  });

  it('switches to rating descending when rating is clicked', async () => {
    render(<NearbyList tier1={tier1} tier2={tier2} onSelectPoi={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Rating/ }));
    expect(screen.getByRole('button', { name: /Rating ↓/ })).toBeInTheDocument();
    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Place C');
    expect(items[1]).toHaveTextContent('Place A');
    expect(items[2]).toHaveTextContent('Place B');
  });

  it('flips rating to ascending when clicked again', async () => {
    render(<NearbyList tier1={tier1} tier2={tier2} onSelectPoi={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Rating/ }));
    await userEvent.click(screen.getByRole('button', { name: /Rating/ }));
    expect(screen.getByRole('button', { name: /Rating ↑/ })).toBeInTheDocument();
    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Place B');
    expect(items[2]).toHaveTextContent('Place C');
  });
});
