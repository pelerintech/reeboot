/**
 * Spec: conversation-id-validation
 *
 * A validation helper accepts safe conversation ids and rejects malformed or
 * reserved ones.
 */

import { describe, it, expect } from 'vitest';
import { isValidConversationId } from '@src/channels/conversation-id.js';

describe('conversation-id-validation', () => {
  it('S1 — accepts a valid id', () => {
    expect(isValidConversationId('cust-42')).toBe(true);
    expect(isValidConversationId('abc.def:1')).toBe(true);
    expect(isValidConversationId('A'.repeat(128))).toBe(true);
  });

  it('S2 — rejects malformed ids', () => {
    expect(isValidConversationId('')).toBe(false);
    expect(isValidConversationId('A'.repeat(129))).toBe(false);
    expect(isValidConversationId('has space')).toBe(false);
    expect(isValidConversationId('a/b')).toBe(false);
    expect(isValidConversationId('..')).toBe(false);
  });

  it('S3 — rejects reserved ids', () => {
    expect(isValidConversationId('main')).toBe(false);
    expect(isValidConversationId('__system__')).toBe(false);
    expect(isValidConversationId('scheduler')).toBe(false);
    expect(isValidConversationId('__outage_probe__')).toBe(false);
  });
});
