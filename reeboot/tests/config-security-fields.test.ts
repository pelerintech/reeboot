import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.REEBOOT_YOLO_MODE;
});

describe('security config schema — dangerous_commands', () => {
  it('parses all dangerous_commands fields from config', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      security: {
        dangerous_commands: {
          mode: 'manual',
          yolo: false,
          timeout: 30,
        },
      },
    }));
    const cfg = loadConfig(configPath);
    expect(cfg.security.dangerous_commands.mode).toBe('manual');
    expect(cfg.security.dangerous_commands.yolo).toBe(false);
    expect(cfg.security.dangerous_commands.timeout).toBe(30);
  });

  it('defaults dangerous_commands.mode to "deny"', async () => {
    const { defaultConfig } = await import('@src/config.js');
    expect(defaultConfig.security.dangerous_commands.mode).toBe('deny');
  });

  it('defaults dangerous_commands.timeout to 60', async () => {
    const { defaultConfig } = await import('@src/config.js');
    expect(defaultConfig.security.dangerous_commands.timeout).toBe(60);
  });

  it('defaults dangerous_commands.yolo to false', async () => {
    const { defaultConfig } = await import('@src/config.js');
    expect(defaultConfig.security.dangerous_commands.yolo).toBe(false);
  });

  it('rejects invalid dangerous_commands.mode', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      security: { dangerous_commands: { mode: 'invalid' } },
    }));
    expect(() => loadConfig(configPath)).toThrow();
  });

  it('rejects timeout below minimum (5)', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      security: { dangerous_commands: { timeout: 1 } },
    }));
    expect(() => loadConfig(configPath)).toThrow();
  });

  it('rejects timeout above maximum (3600)', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      security: { dangerous_commands: { timeout: 9999 } },
    }));
    expect(() => loadConfig(configPath)).toThrow();
  });
});

describe('security config schema — website_blocklist', () => {
  it('parses website_blocklist fields', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      security: {
        website_blocklist: { enabled: true, domains: ['evil.com', 'bad.org'] },
      },
    }));
    const cfg = loadConfig(configPath);
    expect(cfg.security.website_blocklist.enabled).toBe(true);
    expect(cfg.security.website_blocklist.domains).toEqual(['evil.com', 'bad.org']);
  });

  it('defaults website_blocklist.enabled to false', async () => {
    const { defaultConfig } = await import('@src/config.js');
    expect(defaultConfig.security.website_blocklist.enabled).toBe(false);
  });

  it('defaults website_blocklist.domains to empty array', async () => {
    const { defaultConfig } = await import('@src/config.js');
    expect(defaultConfig.security.website_blocklist.domains).toEqual([]);
  });
});

describe('security config schema — allow_private_urls', () => {
  it('parses allow_private_urls', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      security: { allow_private_urls: true },
    }));
    const cfg = loadConfig(configPath);
    expect(cfg.security.allow_private_urls).toBe(true);
  });

  it('defaults allow_private_urls to false', async () => {
    const { defaultConfig } = await import('@src/config.js');
    expect(defaultConfig.security.allow_private_urls).toBe(false);
  });
});

describe('security config schema — advisories', () => {
  it('parses advisories.acked_advisories', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      security: { advisories: { acked_advisories: ['ADV-001', 'ADV-002'] } },
    }));
    const cfg = loadConfig(configPath);
    expect(cfg.security.advisories.acked_advisories).toEqual(['ADV-001', 'ADV-002']);
  });

  it('defaults acked_advisories to empty array', async () => {
    const { defaultConfig } = await import('@src/config.js');
    expect(defaultConfig.security.advisories.acked_advisories).toEqual([]);
  });
});

describe('security config schema — combined defaults', () => {
  it('default SecurityConfig includes all new fields with sensible defaults', async () => {
    const { defaultConfig } = await import('@src/config.js');
    const s = defaultConfig.security;
    expect(s.dangerous_commands).toBeDefined();
    expect(s.dangerous_commands.mode).toBe('deny');
    expect(s.dangerous_commands.timeout).toBe(60);
    expect(s.dangerous_commands.yolo).toBe(false);
    expect(s.website_blocklist).toBeDefined();
    expect(s.website_blocklist.enabled).toBe(false);
    expect(s.website_blocklist.domains).toEqual([]);
    expect(s.allow_private_urls).toBe(false);
    expect(s.advisories).toBeDefined();
    expect(s.advisories.acked_advisories).toEqual([]);
    // Existing field still intact
    expect(s.injection_guard).toBeDefined();
    expect(s.injection_guard.enabled).toBe(true);
  });
});
