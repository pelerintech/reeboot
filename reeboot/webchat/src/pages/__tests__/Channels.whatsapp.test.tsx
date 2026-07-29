import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Channels from '../Channels';

// Mock fetch for channel polling
function mockFetchChannels(channels: any[]) {
  return vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(channels),
  } as any);
}

describe('Channels page WhatsApp buttons', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as any)
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function expandChannel() {
    const heading = await screen.findByText('whatsapp');
    heading.click();
  }

  it('shows Connect button when WhatsApp is disconnected', async () => {
    mockFetchChannels([{ type: 'whatsapp', status: 'disconnected', connectedAt: null }]);
    render(<Channels />);
    await expandChannel();
    const connectBtn = await screen.findByText('Connect');
    expect(connectBtn).toBeInTheDocument();
    // Should NOT show Login or generic Reconnect
    expect(screen.queryByText('Login')).not.toBeInTheDocument();
  });

  it('shows Switch account and Logout when WhatsApp is connected', async () => {
    mockFetchChannels([{ type: 'whatsapp', status: 'connected', connectedAt: new Date().toISOString() }]);
    render(<Channels />);
    await expandChannel();
    const switchBtn = await screen.findByText('Switch account');
    expect(switchBtn).toBeInTheDocument();
    const logoutBtn = await screen.findByText('Logout');
    expect(logoutBtn).toBeInTheDocument();
  });

  it('shows Reconnect button when WhatsApp status is error', async () => {
    mockFetchChannels([{ type: 'whatsapp', status: 'error', connectedAt: null }]);
    render(<Channels />);
    await expandChannel();
    const reconnectBtn = await screen.findByText('Reconnect');
    expect(reconnectBtn).toBeInTheDocument();
  });
});
