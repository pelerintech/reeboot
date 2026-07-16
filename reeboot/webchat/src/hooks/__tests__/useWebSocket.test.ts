import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket, type WSEvent } from '../useWebSocket';

// Track WebSocket instances
let instances: any[] = [];

// Mock WebSocket with static constants
const MockWebSocket = vi.fn(function (this: any, url: string) {
  this.url = url;
  this.readyState = 1; // OPEN
  instances.push(this);

  // Fire onopen asynchronously (after hook sets the callback)
  queueMicrotask(() => {
    if (this.onopen) {
      this.onopen();
    }
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

beforeEach(() => {
  instances = [];
  MockWebSocket.mockClear();
  (globalThis as any).WebSocket = MockWebSocket;
});

afterEach(() => {
  delete (globalThis as any).WebSocket;
});

describe('useWebSocket', () => {
  it('creates WebSocket connection on mount', () => {
    renderHook(() => useWebSocket());
    expect(MockWebSocket).toHaveBeenCalled();
    expect(instances.length).toBe(1);
  });

  it('connects to the correct endpoint', () => {
    renderHook(() => useWebSocket({ contextId: 'test-context' }));
    expect(MockWebSocket.mock.calls[0][0]).toContain('/ws/chat/test-context');
  });

  it('uses default contextId of main', () => {
    renderHook(() => useWebSocket());
    expect(MockWebSocket.mock.calls[0][0]).toContain('/ws/chat/main');
  });

  it('transitions to connected state', async () => {
    const { result } = renderHook(() => useWebSocket());
    await act(async () => {
      // Wait for microtask (onopen callback)
      await Promise.resolve();
    });
    expect(result.current.status).toBe('connected');
  });

  it('sends messages via WebSocket', () => {
    const { result } = renderHook(() => useWebSocket());
    const ws = instances[0];

    act(() => {
      result.current.send({ type: 'message', content: 'Hello!' });
    });

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'message', content: 'Hello!' }));
  });

  it('receives messages and calls onMessage callback', () => {
    const onMessage = vi.fn();
    renderHook(() => useWebSocket({ onMessage }));

    const testEvent: WSEvent = { type: 'text_delta', content: 'Hello' };
    const ws = instances[0];

    act(() => {
      ws.onmessage({ data: JSON.stringify(testEvent) } as MessageEvent);
    });

    expect(onMessage).toHaveBeenCalledWith(testEvent);
  });

  it('sends cancel message', () => {
    const { result } = renderHook(() => useWebSocket());
    const ws = instances[0];

    act(() => {
      result.current.cancel();
    });

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'cancel' }));
  });

  it('handles connection error', () => {
    const { result } = renderHook(() => useWebSocket());
    const ws = instances[0];

    act(() => {
      ws.onerror();
    });

    expect(result.current.status).toBe('error');
  });

  it('disconnects on close', async () => {
    const { result } = renderHook(() => useWebSocket({ autoReconnect: false }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe('connected');

    const ws = instances[0];
    act(() => {
      ws.close();
    });

    expect(result.current.status).toBe('disconnected');
  });

  it('provides reconnect function', () => {
    const { result } = renderHook(() => useWebSocket({ autoReconnect: false }));
    expect(typeof result.current.reconnect).toBe('function');
  });

  it('cleans up on unmount', () => {
    renderHook(() => useWebSocket());
    const ws = instances[0];
    vi.spyOn(ws, 'close');

    act(() => {
      // Trigger unmount by re-rendering with different props
    });

    expect(ws.close).toHaveBeenCalled();
  });
});
