import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ConfirmWidget from '../ConfirmWidget';

describe('ConfirmWidget', () => {
  it('renders title, message, and confirm + cancel buttons', () => {
    render(
      <ConfirmWidget
        title="Cancel order?"
        message="Order #123 will be cancelled"
        confirmLabel="Yes, cancel"
        cancelLabel="No"
        onAction={vi.fn()}
      />
    );
    expect(screen.getByText('Cancel order?')).toBeInTheDocument();
    expect(screen.getByText('Order #123 will be cancelled')).toBeInTheDocument();
    expect(screen.getByText('Yes, cancel')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('calls onAction with { action: "confirm", value: true } when confirm is clicked', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmWidget
        title="Cancel?"
        message="Sure?"
        onAction={onAction}
      />
    );
    await user.click(screen.getByText('Yes'));
    expect(onAction).toHaveBeenCalledWith({ action: 'confirm', value: true });
  });

  it('calls onAction with { action: "confirm", value: false } when cancel is clicked', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmWidget
        title="Cancel?"
        message="Sure?"
        onAction={onAction}
      />
    );
    await user.click(screen.getByText('No'));
    expect(onAction).toHaveBeenCalledWith({ action: 'confirm', value: false });
  });
});
