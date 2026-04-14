/**
 * Channel Trust Config Tests
 *
 * Covers:
 *   - Channel trust fields (trust, trusted_senders) on web/whatsapp/signal
 *   - Contexts tool whitelist config
 */

import { describe, it, expect } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync } from 'fs';

async function getLoadConfig() {
  const { loadConfig } = await import('@src/config.js');
  return loadConfig;
}

function writeTempConfig(data: unknown): string {
  const path = join(tmpdir(), `reeboot-test-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(data));
  return path;
}

describe('Channel trust fields', () => {
  it('parses web channel trust = end-user', async () => {
    const loadConfig = await getLoadConfig();
    const path = writeTempConfig({ channels: { web: { trust: 'end-user' } } });
    const config = loadConfig(path);
    expect(config.channels.web.trust).toBe('end-user');
  });

  it('defaults channel trust to owner when not specified', async () => {
    const loadConfig = await getLoadConfig();
    const path = writeTempConfig({});
    const config = loadConfig(path);
    expect(config.channels.web.trust).toBe('owner');
    expect(config.channels.whatsapp.trust).toBe('owner');
    expect(config.channels.signal.trust).toBe('owner');
  });

  it('parses trusted_senders on whatsapp channel', async () => {
    const loadConfig = await getLoadConfig();
    const path = writeTempConfig({
      channels: { whatsapp: { trusted_senders: ['+15551234567'] } },
    });
    const config = loadConfig(path);
    expect(config.channels.whatsapp.trusted_senders).toEqual(['+15551234567']);
  });

  it('defaults trusted_senders to empty array', async () => {
    const loadConfig = await getLoadConfig();
    const path = writeTempConfig({});
    const config = loadConfig(path);
    expect(config.channels.web.trusted_senders).toEqual([]);
    expect(config.channels.whatsapp.trusted_senders).toEqual([]);
    expect(config.channels.signal.trusted_senders).toEqual([]);
  });

  it('parses signal channel trust = end-user with trusted senders', async () => {
    const loadConfig = await getLoadConfig();
    const path = writeTempConfig({
      channels: { signal: { trust: 'end-user', trusted_senders: ['+19991234567'] } },
    });
    const config = loadConfig(path);
    expect(config.channels.signal.trust).toBe('end-user');
    expect(config.channels.signal.trusted_senders).toEqual(['+19991234567']);
  });
});

describe('Contexts tool whitelist', () => {
  it('parses contexts with tool whitelist', async () => {
    const loadConfig = await getLoadConfig();
    const path = writeTempConfig({
      contexts: [{ name: 'support', tools: { whitelist: ['send_message'] } }],
    });
    const config = loadConfig(path);
    expect(config.contexts).toHaveLength(1);
    expect(config.contexts[0].name).toBe('support');
    expect(config.contexts[0].tools.whitelist).toEqual(['send_message']);
  });

  it('defaults contexts to empty array when not specified', async () => {
    const loadConfig = await getLoadConfig();
    const path = writeTempConfig({});
    const config = loadConfig(path);
    expect(config.contexts).toEqual([]);
  });

  it('defaults tools.whitelist to empty array', async () => {
    const loadConfig = await getLoadConfig();
    const path = writeTempConfig({
      contexts: [{ name: 'support' }],
    });
    const config = loadConfig(path);
    expect(config.contexts[0].tools.whitelist).toEqual([]);
  });
});
