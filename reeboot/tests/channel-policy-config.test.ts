/**
 * Config schema tests for channel-policy owner_id field.
 */

import { describe, it, expect } from 'vitest';

describe('Channel config schema — owner_id', () => {
  it('WhatsApp config accepts owner_id and defaults to empty string', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const cfg = ConfigSchema.parse({
      channels: {
        whatsapp: { enabled: true, owner_id: '+40700000001' },
      },
    });
    expect((cfg.channels.whatsapp as any).owner_id).toBe('+40700000001');
  });

  it('WhatsApp config owner_id defaults to empty string when absent', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const cfg = ConfigSchema.parse({
      channels: { whatsapp: { enabled: true } },
    });
    expect((cfg.channels.whatsapp as any).owner_id).toBe('');
  });

  it('Signal config accepts owner_id and defaults to empty string', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const cfg = ConfigSchema.parse({
      channels: {
        signal: { enabled: true, phoneNumber: '+40700000001', owner_id: '+40700000002' },
      },
    });
    expect((cfg.channels.signal as any).owner_id).toBe('+40700000002');
  });

  it('Signal config owner_id defaults to empty string when absent', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const cfg = ConfigSchema.parse({
      channels: { signal: { enabled: true, phoneNumber: '+40700000001' } },
    });
    expect((cfg.channels.signal as any).owner_id).toBe('');
  });
});
