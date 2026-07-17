/**
 * Spec: conversation-id-message
 *
 * IncomingMessage carries a `conversationId` isolation axis distinct from the
 * `peerId` routing token.
 *
 * NOTE on RED: the runtime field round-trips today via the blind spread in
 * `createIncomingMessage`, so the assertions below pass at runtime. The real
 * gap is the MISSING TYPE DECLARATION on `IncomingMessage` — the field is not
 * a declared, first-class part of the contract. RED is established by the
 * absence of `conversationId` from the interface (verified by grep) and will
 * be locked by GREEN via `npm run build` (tsc) once the field is declared and
 * threaded explicitly through `createIncomingMessage`.
 */

import { describe, it, expect } from 'vitest';
import { createIncomingMessage } from '@src/channels/interface.js';

describe('conversation-id-message', () => {
  it('S1 — field round-trips', () => {
    const msg = createIncomingMessage({
      channelType: 'web',
      peerId: 'sess1',
      conversationId: 'A',
      content: 'hi',
      raw: null,
    });
    expect(msg.conversationId).toBe('A');
    expect(msg.peerId).toBe('sess1');
  });

  it('S2 — field is optional (backward compatible)', () => {
    const msg = createIncomingMessage({
      channelType: 'signal',
      peerId: '+123',
      content: 'hi',
      raw: null,
    });
    expect(msg.conversationId).toBeUndefined();
    expect(msg.peerId).toBe('+123');
  });
});
