import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import Channels from '../Channels';

// Smart fetch mock: routes by URL so channel polling returns a disconnected
// WhatsApp row, while the /qr and /pair endpoints return success payloads.
function makeFetchMock(opts: { qrOk?: boolean; channels?: any[] } = {}) {
  const { qrOk = true, channels = [{ type: 'whatsapp', status: 'disconnected', connectedAt: null }] } = opts;
  const calls: { url: string; opts?: any }[] = [];
  const impl = (url: string, fetchOpts?: any) => {
    calls.push({ url, opts: fetchOpts });
    if (url === '/api/channels') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(channels) } as any);
    }
    if (url === '/api/channels/whatsapp/qr') {
      const body = qrOk
        ? { qrDataUrl: 'data:image/png;base64,abc' }
        : {};
      return Promise.resolve({ ok: qrOk, json: () => Promise.resolve(body) } as any);
    }
    if (url === '/api/channels/whatsapp/pair') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'paired' }) } as any);
    }
    if (url === '/api/channels/whatsapp/reset') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'reset' }) } as any);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as any);
  };
  return { impl, calls };
}

async function expandWhatsApp() {
  const heading = await screen.findByText('whatsapp');
  fireEvent.click(heading);
}

describe('Channels page — AbortController + onScanTimeout wiring', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('passes an AbortSignal to the /qr fetch and aborts it on unmount', async () => {
    const { impl, calls } = makeFetchMock();
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl as any);

    const { unmount } = render(<Channels />);
    await expandWhatsApp();
    const connectBtn = await screen.findByText('Connect');

    await act(async () => { fireEvent.click(connectBtn); });

    const qrCall = calls.find((c) => c.url === '/api/channels/whatsapp/qr');
    expect(qrCall).toBeDefined();
    const signal = qrCall!.opts?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);

    // Navigating away (unmount) must abort the in-flight request — no leaks
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('passes an AbortSignal to the /pair fetch and aborts it on unmount', async () => {
    // /qr returns a failure so the dialog lands in timeout mode, which exposes
    // the "Use phone number" button — the pairing entry point — without timers.
    const { impl, calls } = makeFetchMock({ qrOk: false });
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl as any);

    const { unmount } = render(<Channels />);
    await expandWhatsApp();
    const connectBtn = await screen.findByText('Connect');

    await act(async () => { fireEvent.click(connectBtn); });
    // /qr failed → timeout mode with a "Use phone number" button
    const usePhoneBtn = await screen.findByText(/Use phone number/);
    await act(async () => { fireEvent.click(usePhoneBtn); });

    const input = screen.getByPlaceholderText('+1234567890') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '+15551234567' } });
    const submitBtn = screen.getByText(/Send pairing request/);
    await act(async () => { fireEvent.click(submitBtn); });

    const pairCall = calls.find((c) => c.url === '/api/channels/whatsapp/pair');
    expect(pairCall).toBeDefined();
    const signal = pairCall!.opts?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);

    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('flips to timeout mode after 2 min of an unscanned QR (onScanTimeout wired)', async () => {
    vi.useFakeTimers();
    try {
      const { impl } = makeFetchMock();
      vi.spyOn(globalThis, 'fetch').mockImplementation(impl as any);

      render(<Channels />);
      // Flush the initial channel-fetch microtask chain so the row renders
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      fireEvent.click(screen.getByText('whatsapp'));
      await act(async () => { await Promise.resolve(); });
      fireEvent.click(screen.getByText('Connect'));
      // Flush the /qr fetch so the QR is displayed
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });

      expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,abc');
      expect(screen.queryByText(/QR code expired/)).not.toBeInTheDocument();

      // After 2 min of no scan, the dialog transitions to the timeout mode
      await act(async () => { vi.advanceTimersByTime(120_000); });
      expect(screen.getByText(/QR code expired/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts the /pair request when Cancel is clicked during pairing_wait', async () => {
    // /qr returns failure → timeout mode → "Use phone number" → pairing mode
    const { impl, calls } = makeFetchMock({ qrOk: false });
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl as any);

    render(<Channels />);
    await expandWhatsApp();
    const connectBtn = await screen.findByText('Connect');
    await act(async () => { fireEvent.click(connectBtn); });

    // /qr failed → timeout mode shows "Use phone number"
    const usePhoneBtn = await screen.findByText(/Use phone number/);
    await act(async () => { fireEvent.click(usePhoneBtn); });

    // pairing mode: enter phone and submit
    const input = screen.getByPlaceholderText('+1234567890') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '+15551234567' } });
    const submitBtn = screen.getByText(/Send pairing request/);
    await act(async () => { fireEvent.click(submitBtn); });

    // Capture the /pair call and its signal before Cancel
    const pairCall = calls.find((c) => c.url === '/api/channels/whatsapp/pair');
    expect(pairCall).toBeDefined();
    const signal = pairCall!.opts?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);

    // Cancel during pairing_wait — must abort the in-flight /pair request
    const cancelBtn = screen.getByText('Cancel');
    await act(async () => { fireEvent.click(cancelBtn); });

    expect(signal.aborted).toBe(true);
  });
});
