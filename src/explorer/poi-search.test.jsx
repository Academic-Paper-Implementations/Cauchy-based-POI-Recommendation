import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PoiSearch from './poi-search.jsx';

const instances = [
  { id: 'a', name: 'Café Mocha', feature: 'Coffee' },
  { id: 'b', name: 'Pizza Palace', feature: 'Italian' },
  { id: 'c', name: 'Mocha Bar', feature: 'Bar' },
  { id: 'd', name: 'Thai Delight', feature: 'Thai' },
];

describe('PoiSearch', () => {
  it('shows no results dropdown when query is empty', () => {
    render(<PoiSearch instances={instances} onSelect={() => {}} />);
    expect(screen.queryByText('No matches')).not.toBeInTheDocument();
    expect(screen.queryByText('Café Mocha')).not.toBeInTheDocument();
  });

  it('filters instances by name (case-insensitive substring)', async () => {
    render(<PoiSearch instances={instances} onSelect={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText('Search by name…'), 'mocha');
    expect(screen.getByText('Café Mocha')).toBeInTheDocument();
    expect(screen.getByText('Mocha Bar')).toBeInTheDocument();
    expect(screen.queryByText('Pizza Palace')).not.toBeInTheDocument();
  });

  it('shows "No matches" when query finds nothing', async () => {
    render(<PoiSearch instances={instances} onSelect={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText('Search by name…'), 'xyz');
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('calls onSelect with the chosen POI and clears input', async () => {
    const onSelect = vi.fn();
    render(<PoiSearch instances={instances} onSelect={onSelect} />);
    const input = screen.getByPlaceholderText('Search by name…');
    await userEvent.type(input, 'pizza');
    await userEvent.click(screen.getByText('Pizza Palace'));
    expect(onSelect).toHaveBeenCalledWith(instances[1]);
    expect(input.value).toBe('');
  });

  it('shows the feature type alongside the name', async () => {
    render(<PoiSearch instances={instances} onSelect={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText('Search by name…'), 'thai');
    expect(screen.getByText('Thai Delight')).toBeInTheDocument();
    expect(screen.getByText('Thai')).toBeInTheDocument();
  });
});
