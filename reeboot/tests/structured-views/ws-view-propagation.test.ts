import { describe, it, expect } from 'vitest';

describe('WS broadcast view propagation', () => {
  it('tool_call_end event serializes view field through JSON.stringify', () => {
    // The server.ts wsEvent callback does: ws.send(JSON.stringify(event))
    // Verify that a tool_call_end event with view serializes correctly
    const event = {
      type: 'tool_call_end',
      toolCallId: 'test-123',
      toolName: 'test-tool',
      result: [{ type: 'text', text: 'done' }],
      view: { type: 'data-table', columns: ['Name'], rows: [{ Name: 'Alice' }] },
      isError: false,
    };

    const serialized = JSON.stringify(event);
    const parsed = JSON.parse(serialized);

    expect(parsed.view).toBeDefined();
    expect(parsed.view.type).toBe('data-table');
    expect(parsed.view.columns).toEqual(['Name']);
  });

  it('tool_call_end event serializes without view field when absent', () => {
    const event = {
      type: 'tool_call_end',
      toolCallId: 'test-123',
      toolName: 'test-tool',
      result: 'done',
      isError: false,
      // no view field
    };

    const serialized = JSON.stringify(event);
    const parsed = JSON.parse(serialized);

    expect(parsed.view).toBeUndefined();
  });

  it('WebAdapter.sendEvent forwards RunnerEvent including view field', async () => {
    // Verify that WebAdapter's sendEvent passes the event through unchanged
    const { WebAdapter } = await import('@src/channels/web.js');
    const adapter = new WebAdapter({} as any, {} as any);

    let receivedEvent: any = null;
    adapter.registerPeer('test-peer', async () => {}, (event) => { receivedEvent = event; });

    const event = {
      type: 'tool_call_end',
      toolCallId: 'test-123',
      toolName: 'test-tool',
      result: 'done',
      view: { type: 'data-table' as const, columns: ['Name'], rows: [{ Name: 'Alice' }] },
      isError: false,
    };
    adapter.sendEvent('test-peer', event as any);

    expect(receivedEvent).toBeDefined();
    expect(receivedEvent!.view).toBeDefined();
    expect(receivedEvent!.view.type).toBe('data-table');
  });
});
