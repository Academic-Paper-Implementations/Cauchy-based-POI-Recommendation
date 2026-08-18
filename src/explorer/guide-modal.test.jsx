import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GuideModal from './guide-modal.jsx';

describe('GuideModal', () => {
  it('renders nothing when closed', () => {
    render(<GuideModal open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the dialog when open', () => {
    render(<GuideModal open={true} onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('How to use the Explorer')).toBeInTheDocument();
  });

  it('displays key metric headings', () => {
    render(<GuideModal open={true} onClose={() => {}} />);
    expect(screen.getByText('Search distance (ε)')).toBeInTheDocument();
    expect(screen.getByText('Popularity (min_prev)')).toBeInTheDocument();
    expect(screen.getByText('Co-location')).toBeInTheDocument();
    expect(screen.getByText('Price ($–$$$$)')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<GuideModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    render(<GuideModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<GuideModal open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the panel', () => {
    const onClose = vi.fn();
    render(<GuideModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('How to use the Explorer'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
