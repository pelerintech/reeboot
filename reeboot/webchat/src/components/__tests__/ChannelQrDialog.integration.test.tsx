import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ChannelQrDialog from '../ChannelQrDialog';

describe('ChannelQrDialog auto-close on connected', () => {
  it('renders normally when isConnected is false', () => {
    render(
      <ChannelQrDialog
        visible={true}
        mode="qr"
        qrDataUrl="data:image/png;base64,test"
        isConnected={false}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('calls onClose after a short delay when isConnected becomes true', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <ChannelQrDialog
        visible={true}
        mode="qr"
        qrDataUrl="data:image/png;base64,test"
        isConnected={true}
        onClose={onClose}
      />
    );
    // Should not have called onClose immediately
    expect(onClose).not.toHaveBeenCalled();
    // After the timeout (500ms), it should be called
    vi.advanceTimersByTime(500);
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does not call onClose when visible is false even if isConnected is true', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <ChannelQrDialog
        visible={false}
        mode="qr"
        qrDataUrl="data:image/png;base64,test"
        isConnected={true}
        onClose={onClose}
      />
    );
    vi.advanceTimersByTime(500);
    expect(onClose).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
