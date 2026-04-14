import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-inj-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('security.injection_guard config schema', () => {
  it('parses security.injection_guard.enabled = false', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      security: { injection_guard: { enabled: false } }
    }));
    const cfg = loadConfig(configPath);
    expect(cfg.security.injection_guard.enabled).toBe(false);
  });

  it('defaults injection_guard.enabled to true when security field absent', async () => {
    const { loadConfig } = await import('@src/config.js');
    const cfg = loadConfig(join(tmpDir, 'config.json'));
    expect(cfg.security.injection_guard.enabled).toBe(true);
  });

  it('defaults external_source_tools to [fetch_url, web_fetch]', async () => {
    const { loadConfig } = await import('@src/config.js');
    const cfg = loadConfig(join(tmpDir, 'config.json'));
    expect(cfg.security.injection_guard.external_source_tools).toEqual(['fetch_url', 'web_fetch']);
  });

  it('accepts custom external_source_tools list', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      security: { injection_guard: { external_source_tools: ['gmail_read', 'rss_read'] } }
    }));
    const cfg = loadConfig(configPath);
    expect(cfg.security.injection_guard.external_source_tools).toEqual(['gmail_read', 'rss_read']);
  });
});
