import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ChannelQrDialog from '../ChannelQrDialog';

describe('ChannelQrDialog — fallback link, scan timeout, spec messages', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does NOT show the "QR not working?" fallback link before 30 seconds', () => {
    render(
      <ChannelQrDialog
        visible={true}
        mode="qr"
        qrDataUrl="data:image/png;base64,abc"
        onClose={vi.fn()}
        onTryPairing={vi.fn()}
        onScanTimeout={vi.fn()}
      />
    );
    expect(screen.queryByText(/QR not working/)).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(29_000); });
    expect(screen.queryByText(/QR not working/)).not.toBeInTheDocument();
  });

  it('shows the "QR not working? Try phone number instead" link after 30 seconds and calls onTryPairing on click', () => {
    const onTryPairing = vi.fn();
    render(
      <ChannelQrDialog
        visible={true}
        mode="qr"
        qrDataUrl="data:image/png;base64,abc"
        onClose={vi.fn()}
        onTryPairing={onTryPairing}
        onScanTimeout={vi.fn()}
      />
    );
    act(() => { vi.advanceTimersByTime(30_000); });
    const link = screen.getByText(/QR not working\? Try phone number instead/);
    expect(link).toBeInTheDocument();
    fireEvent.click(link);
    expect(onTryPairing).toHaveBeenCalledTimes(1);
  });

  it('calls onScanTimeout after 2 minutes (120s) when the QR is displayed and unscanned', () => {
    const onScanTimeout = vi.fn();
    render(
      <ChannelQrDialog
        visible={true}
        mode="qr"
        qrDataUrl="data:image/png;base64,abc"
        onClose={vi.fn()}
        onScanTimeout={onScanTimeout}
      />
    );
    act(() => { vi.advanceTimersByTime(119_999); });
    expect(onScanTimeout).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onScanTimeout).toHaveBeenCalledTimes(1);
  });

  it('resets the fallback timer when a new QR is returned (retry)', () => {
    const onTryPairing = vi.fn();
    const { rerender } = render(
      <ChannelQrDialog
        visible={true}
        mode="qr"
        qrDataUrl="data:image/png;base64,first"
        onClose={vi.fn()}
        onTryPairing={onTryPairing}
        onScanTimeout={vi.fn()}
      />
    );
    act(() => { vi.advanceTimersByTime(25_000); });
    // New QR arrives (retry) — timer should reset
    rerender(
      <ChannelQrDialog
        visible={true}
        mode="qr"
        qrDataUrl="data:image/png;base64,second"
        onClose={vi.fn()}
        onTryPairing={onTryPairing}
        onScanTimeout={vi.fn()}
      />
    );
    act(() => { vi.advanceTimersByTime(29_000); });
    // Only 29s since the new QR — link should not be visible yet
    expect(screen.queryByText(/QR not working/)).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(screen.getByText(/QR not working\? Try phone number instead/)).toBeInTheDocument();
  });

  it('shows the exact spec timeout message in timeout mode', () => {
    render(
      <ChannelQrDialog
        visible={true}
        mode="timeout"
        onClose={vi.fn()}
        onRetryQr={vi.fn()}
        onTryPairing={vi.fn()}
      />
    );
    expect(screen.getByText('QR code expired. You can try again or use your phone number instead.')).toBeInTheDocument();
  });

  it('shows the exact spec pairing_wait message', () => {
    render(
      <ChannelQrDialog
        visible={true}
        mode="pairing_wait"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Pairing request sent. Approve the link on your phone.')).toBeInTheDocument();
  });

  it('shows the exact spec pairing_error message', () => {
    render(
      <ChannelQrDialog
        visible={true}
        mode="pairing_error"
        onClose={vi.fn()}
        onRetryQr={vi.fn()}
        onTryPairing={vi.fn()}
      />
    );
    expect(screen.getByText('Pairing failed. Try again or use QR.')).toBeInTheDocument();
  });

  it('labels the phone input "Phone number (with country code)"', () => {
    render(
      <ChannelQrDialog
        visible={true}
        mode="pairing"
        onClose={vi.fn()}
        onPairingSubmit={vi.fn()}
      />
    );
    const input = screen.getByPlaceholderText('+1234567890');
    expect(input).toBeInTheDocument();
    // Explicit <label> associated with the input carries the spec text
    expect(screen.getByText('Phone number (with country code)')).toBeInTheDocument();
  });
});
