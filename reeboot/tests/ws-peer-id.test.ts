/**
 * WS peer ID — per-connection unique identity
 *
 * Verifies that each WebSocket connection gets a unique sessionId
 * for reply routing, preventing collisions between concurrent connections.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { webAdapter } from '../src/channels/web.js';
import { nanoid } from 'nanoid';

describe('WS peer ID — unique per connection', () => {
  beforeEach(() => {
    // Clear all peer registrations between tests
    webAdapter.unregisterPeer('session-1');
    webAdapter.unregisterPeer('session-2');
  });

  it('two connections receive different sessionIds', () => {
    const session1 = nanoid();
    const session2 = nanoid();

    expect(session1).not.toBe(session2);
  });

  it('registering two peers creates two entries in event callbacks', () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    const eventFn1 = vi.fn();
    const eventFn2 = vi.fn();

    webAdapter.registerPeer('session-1', sendFn, eventFn1);
    webAdapter.registerPeer('session-2', sendFn, eventFn2);

    // Send events to each peer — both should receive
    webAdapter.sendEvent('session-1', { type: 'text_delta', delta: 'Hello 1' });
    webAdapter.sendEvent('session-2', { type: 'text_delta', delta: 'Hello 2' });

    expect(eventFn1).toHaveBeenCalledTimes(1);
    expect(eventFn1).toHaveBeenCalledWith({ type: 'text_delta', delta: 'Hello 1' });
    expect(eventFn2).toHaveBeenCalledTimes(1);
    expect(eventFn2).toHaveBeenCalledWith({ type: 'text_delta', delta: 'Hello 2' });
  });

  it('unregistering one peer does not affect the other', () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    const eventFn1 = vi.fn();
    const eventFn2 = vi.fn();

    webAdapter.registerPeer('session-1', sendFn, eventFn1);
    webAdapter.registerPeer('session-2', sendFn, eventFn2);

    webAdapter.unregisterPeer('session-1');

    // session-1 should no longer receive events
    webAdapter.sendEvent('session-1', { type: 'text_delta', delta: 'Should not arrive' });
    webAdapter.sendEvent('session-2', { type: 'text_delta', delta: 'Should arrive' });

    expect(eventFn1).not.toHaveBeenCalled();
    expect(eventFn2).toHaveBeenCalledTimes(1);
    expect(eventFn2).toHaveBeenCalledWith({ type: 'text_delta', delta: 'Should arrive' });
  });
});
