/**
 * Trust Primitives Tests
 *
 * Covers:
 *   - TrustLevel enum values
 *   - McpPermissions defaults (MCP_DEFAULTS)
 *   - MessageTrust type and resolveMessageTrust()
 */

import { describe, it, expect } from 'vitest';

describe('TrustLevel', () => {
  it('has correct values for all trust levels', async () => {
    const { TrustLevel } = await import('@src/trust.js');
    expect(TrustLevel.Builtin).toBe('builtin');
    expect(TrustLevel.Mcp).toBe('mcp');
    expect(TrustLevel.Skill).toBe('skill');
  });
});

describe('MCP_DEFAULTS', () => {
  it('defaults network to false', async () => {
    const { MCP_DEFAULTS } = await import('@src/trust.js');
    expect(MCP_DEFAULTS.network).toBe(false);
  });

  it('defaults filesystem to false', async () => {
    const { MCP_DEFAULTS } = await import('@src/trust.js');
    expect(MCP_DEFAULTS.filesystem).toBe(false);
  });
});

describe('resolveMessageTrust', () => {
  async function getResolveMessageTrust() {
    const { resolveMessageTrust } = await import('@src/trust.js');
    return resolveMessageTrust;
  }

  function makeConfig(channels: Record<string, any> = {}) {
    return { channels } as any;
  }

  it('returns owner for unknown channel', async () => {
    const resolveMessageTrust = await getResolveMessageTrust();
    const config = makeConfig({});
    expect(resolveMessageTrust('unknown', 'peer1', config)).toBe('owner');
  });

  it('returns owner when channel trust is owner', async () => {
    const resolveMessageTrust = await getResolveMessageTrust();
    const config = makeConfig({ web: { trust: 'owner' } });
    expect(resolveMessageTrust('web', 'peer1', config)).toBe('owner');
  });

  it('returns end-user when channel trust is end-user', async () => {
    const resolveMessageTrust = await getResolveMessageTrust();
    const config = makeConfig({ web: { trust: 'end-user' } });
    expect(resolveMessageTrust('web', 'peer1', config)).toBe('end-user');
  });

  it('sender override elevates to owner on end-user channel', async () => {
    const resolveMessageTrust = await getResolveMessageTrust();
    const config = makeConfig({
      whatsapp: { trust: 'end-user', trusted_senders: ['+15551234567'] },
    });
    expect(resolveMessageTrust('whatsapp', '+15551234567', config)).toBe('owner');
  });

  it('non-listed sender stays end-user on end-user channel', async () => {
    const resolveMessageTrust = await getResolveMessageTrust();
    const config = makeConfig({
      whatsapp: { trust: 'end-user', trusted_senders: ['+15551234567'] },
    });
    expect(resolveMessageTrust('whatsapp', '+19999999999', config)).toBe('end-user');
  });

  it('defaults to owner when channel exists but no trust field', async () => {
    const resolveMessageTrust = await getResolveMessageTrust();
    const config = makeConfig({ web: {} });
    expect(resolveMessageTrust('web', 'peer1', config)).toBe('owner');
  });
});
