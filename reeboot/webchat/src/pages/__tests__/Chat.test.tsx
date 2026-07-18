import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Chat from '../Chat';

// Mock WebSocket with static constants
let instances: any[] = [];
const MockWebSocket = vi.fn(function (this: any, url: string) {
  this.url = url;
  this.readyState = 1; // OPEN
  instances.push(this);
  queueMicrotask(() => {
    if (this.onopen) this.onopen();
  });
});
(MockWebSocket as any).OPEN = 1;
(MockWebSocket as any).CONNECTING = 0;
(MockWebSocket as any).CLOSED = 3;

Object.assign(MockWebSocket.prototype, {
  send: vi.fn(),
  close: vi.fn(function (this: any) {
    this.readyState = 3;
    if (this.onclose) this.onclose();
  }),
});

function mockFetchReturning(rows: any[]) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => rows } as any);
}

beforeEach(() => {
  instances = [];
  MockWebSocket.mockClear();
  (globalThis as any).WebSocket = MockWebSocket;
  // jsdom doesn't implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as any).WebSocket;
});

describe('Chat history hydration', () => {
  it('fetches history on mount and renders it (S1)', async () => {
    const fetchMock = mockFetchReturning([
      { role: 'user', content: 'hello', created_at: '2026-07-17 10:00:00' },
      { role: 'assistant', content: 'hi there', created_at: '2026-07-17 10:00:01' },
    ]);
    globalThis.fetch = fetchMock as any;
    render(<Chat />);
    await waitFor(() => expect(screen.getByText('hello')).toBeInTheDocument());
    expect(screen.getByText('hi there')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/contexts/main/messages');
  });

  it('re-hydrates on remount (S2)', async () => {
    globalThis.fetch = mockFetchReturning([
      { role: 'user', content: 'earlier question', created_at: '2026-07-17 09:00:00' },
    ]) as any;
    const { unmount } = render(<Chat />);
    await waitFor(() => expect(screen.getByText('earlier question')).toBeInTheDocument());
    unmount();
    render(<Chat />);
    await waitFor(() => expect(screen.getByText('earlier question')).toBeInTheDocument());
  });

  it('renders empty state when history is empty (S3)', async () => {
    globalThis.fetch = mockFetchReturning([]) as any;
    render(<Chat />);
    await waitFor(() => expect(screen.getByText('How can I help you?')).toBeInTheDocument());
  });

  it('fetches history once, not on WS reconnect (S4)', async () => {
    const fetchMock = mockFetchReturning([
      { role: 'user', content: 'x', created_at: '2026-07-17 09:00:00' },
    ]);
    globalThis.fetch = fetchMock as any;
    render(<Chat />);
    await waitFor(() => expect(screen.getByText('x')).toBeInTheDocument());
    // Simulate a reconnect: trigger onclose on the ws instance, then onopen
    const ws = instances[0];
    ws.onclose?.();
    // After close, the reconnect logic in useWebSocket should re-create the WebSocket
    // Wait for potential re-fetch
    await new Promise((r) => setTimeout(r, 100));
    expect(fetchMock.mock.calls.filter((c: any) => c[0] === '/api/contexts/main/messages').length).toBe(1);
  });
});
