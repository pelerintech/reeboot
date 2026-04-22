import type { ChannelAdapter } from '../channels/interface.js';

/**
 * Broadcasts a text message to all active channel adapters.
 *
 * Sends to the special '__system__' peer so each adapter can route it
 * appropriately (web: all connected WS clients; WhatsApp/Signal: owner peer).
 *
 * Errors from individual adapters are caught and logged — a failure in one
 * adapter never prevents delivery to the others.
 */
export function broadcastToAllChannels(
  adapters: Map<string, ChannelAdapter>,
  text: string
): void {
  for (const [name, adapter] of adapters) {
    try {
      adapter
        .send('__system__', { type: 'text', text })
        .catch((err) => {
          console.error(`[broadcast] Failed to send via ${name}: ${err}`);
        });
    } catch (err) {
      console.error(`[broadcast] Synchronous error via ${name}: ${err}`);
    }
  }
}
