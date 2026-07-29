import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ChannelQrDialog from '../ChannelQrDialog';

describe('ChannelQrDialog', () => {
  it('renders nothing when visible is false', () => {
    const { container } = render(
      <ChannelQrDialog visible={false} mode="qr" qrDataUrl="data:image/png;base64,test" onClose={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders QR image and instructions in qr mode', () => {
    render(
      <ChannelQrDialog
        visible={true}
        mode="qr"
        qrDataUrl="data:image/png;base64,testQrCode"
        onClose={vi.fn()}
      />
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'data:image/png;base64,testQrCode');
    expect(img).toHaveAttribute('width', '280');
    expect(screen.getByText(/Open WhatsApp/)).toBeInTheDocument();
    expect(screen.getByText(/Linked Devices/)).toBeInTheDocument();
  });

  it('shows cancel button and calls onClose when clicked', () => {
    const onClose = vi.fn();
    render(
      <ChannelQrDialog
        visible={true}
        mode="qr"
        qrDataUrl="data:image/png;base64,test"
        onClose={onClose}
      />
    );
    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows QR expired message and retry/fallback buttons in timeout mode', () => {
    const onRetryQr = vi.fn();
    const onTryPairing = vi.fn();
    render(
      <ChannelQrDialog
        visible={true}
        mode="timeout"
        onClose={vi.fn()}
        onRetryQr={onRetryQr}
        onTryPairing={onTryPairing}
      />
    );
    expect(screen.getByText(/QR code expired/)).toBeInTheDocument();
    expect(screen.getByText(/Try QR again/)).toBeInTheDocument();
    expect(screen.getByText(/Use phone number/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Try QR again/));
    expect(onRetryQr).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText(/Use phone number/));
    expect(onTryPairing).toHaveBeenCalledTimes(1);
  });

  it('shows phone number input and submit button in pairing mode', () => {
    render(
      <ChannelQrDialog
        visible={true}
        mode="pairing"
        onClose={vi.fn()}
        onPairingSubmit={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText('+1234567890')).toBeInTheDocument();
    expect(screen.getByText(/Send pairing request/)).toBeInTheDocument();
  });

  it('calls onPairingSubmit with entered phone number', () => {
    const onPairingSubmit = vi.fn();
    render(
      <ChannelQrDialog
        visible={true}
        mode="pairing"
        onClose={vi.fn()}
        onPairingSubmit={onPairingSubmit}
      />
    );
    const input = screen.getByPlaceholderText('+1234567890') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '+1234567890' } });
    fireEvent.click(screen.getByText(/Send pairing request/));
    expect(onPairingSubmit).toHaveBeenCalledWith('+1234567890');
  });

  it('shows scanning state with appropriate message', () => {
    render(
      <ChannelQrDialog
        visible={true}
        mode="scanning"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/Waiting for scan/)).toBeInTheDocument();
  });

  it('shows paired state with connected message', () => {
    render(
      <ChannelQrDialog
        visible={true}
        mode="paired"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/Connected/)).toBeInTheDocument();
  });
});
