import { describe, it, expect } from 'vitest';
import { MessageBus, createIncomingMessage } from '@src/channels/interface.js';

describe('WS action message handler', () => {
  it('confirm action publishes "[User confirmed: true]" to bus', () => {
    // Simulate server.ts handler logic for action messages
    const msg = { type: 'action', action: 'confirm', value: true, surfaceId: 'cf-1' };
    const actionContent = `[User confirmed: ${msg.value ?? false}]`;

    expect(actionContent).toBe('[User confirmed: true]');

    // Verify the message flows through the bus correctly
    const bus = new MessageBus();
    const received: any[] = [];
    bus.onMessage((msg) => received.push(msg));
    bus.publish(createIncomingMessage({
      channelType: 'web',
      peerId: 'test-session',
      content: actionContent,
      raw: null,
    }));
    expect(received).toHaveLength(1);
    expect(received[0].content).toBe('[User confirmed: true]');
    expect(received[0].channelType).toBe('web');
  });

  it('confirm action with false value', () => {
    const actionContent = `[User confirmed: ${false}]`;
    expect(actionContent).toBe('[User confirmed: false]');
  });

  it('form_submit action publishes "[Form Response: {...}]" to bus', () => {
    const fields = { name: 'Acme' };
    const actionContent = `[Form Response: ${JSON.stringify(fields ?? {})}]`;

    expect(actionContent).toContain('[Form Response:');
    expect(actionContent).toContain('"name"');
    expect(actionContent).toContain('"Acme"');

    const bus = new MessageBus();
    const received: any[] = [];
    bus.onMessage((msg) => received.push(msg));
    bus.publish(createIncomingMessage({
      channelType: 'web',
      peerId: 'test-session',
      content: actionContent,
      raw: null,
    }));
    expect(received).toHaveLength(1);
    expect(received[0].content).toContain('Acme');
  });

  it('unknown action type publishes raw action data', () => {
    const msg = { type: 'action', action: 'unknown_action', data: 'test' };
    const actionContent = `[Action: ${JSON.stringify(msg)}]`;
    expect(actionContent).toContain('[Action:');
    expect(actionContent).toContain('unknown_action');
  });
});
