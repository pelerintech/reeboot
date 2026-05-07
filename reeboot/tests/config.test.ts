import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';

// We test via a configPath override so tests don't touch ~/.reeboot
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  // Clear env var overrides
  delete process.env.REEBOOT_PORT;
  delete process.env.REEBOOT_LOG_LEVEL;
  delete process.env.REEBOOT_API_TOKEN;
  delete process.env.REEBOOT_AUTH_MODE;
});

describe('loadConfig()', () => {
  it('returns defaults when config file does not exist', async () => {
    const { loadConfig } = await import('@src/config.js');
    const cfg = loadConfig(join(tmpDir, 'config.json'));
    expect(cfg.channels.web.enabled).toBe(true);
    expect(cfg.channels.web.port).toBe(3000);
    expect(cfg.sandbox.mode).toBe('os');
  });

  it('returns typed config when a valid file exists', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      agent: { name: 'Hal', model: { provider: 'anthropic', id: 'claude-3-opus-20240229', apiKey: 'sk-test' } }
    }));
    const cfg = loadConfig(configPath);
    expect(cfg.agent.name).toBe('Hal');
    expect(cfg.agent.model.provider).toBe('anthropic');
    // defaults still applied
    expect(cfg.channels.web.port).toBe(3000);
  });

  it('merges partial config with defaults', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ agent: { name: 'Hal' } }));
    const cfg = loadConfig(configPath);
    expect(cfg.agent.name).toBe('Hal');
    expect(cfg.channels.web.enabled).toBe(true);
    expect(cfg.channels.web.port).toBe(3000);
  });

  it('throws on invalid JSON', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, '{ bad json ]]');
    expect(() => loadConfig(configPath)).toThrow(/Failed to parse config/);
  });

  it('throws on Zod schema violation', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      channels: { web: { port: 'not-a-number' } }
    }));
    expect(() => loadConfig(configPath)).toThrow();
  });

  it('overrides channels.web.port via REEBOOT_PORT', async () => {
    const { loadConfig } = await import('@src/config.js');
    process.env.REEBOOT_PORT = '4000';
    const cfg = loadConfig(join(tmpDir, 'config.json'));
    expect(cfg.channels.web.port).toBe(4000);
  });

  it('overrides logging.level via REEBOOT_LOG_LEVEL', async () => {
    const { loadConfig } = await import('@src/config.js');
    process.env.REEBOOT_LOG_LEVEL = 'warn';
    const cfg = loadConfig(join(tmpDir, 'config.json'));
    expect(cfg.logging.level).toBe('warn');
  });

  it('overrides server.token via REEBOOT_API_TOKEN', async () => {
    const { loadConfig } = await import('@src/config.js');
    process.env.REEBOOT_API_TOKEN = 'my-secret';
    const cfg = loadConfig(join(tmpDir, 'config.json'));
    expect(cfg.server.token).toBe('my-secret');
  });
});

describe('saveConfig()', () => {
  it('writes config atomically and can be read back', async () => {
    const { loadConfig, saveConfig, defaultConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    const cfg = { ...defaultConfig, agent: { ...defaultConfig.agent, name: 'Saved' } };
    saveConfig(cfg, configPath);
    expect(existsSync(configPath)).toBe(true);
    const loaded = loadConfig(configPath);
    expect(loaded.agent.name).toBe('Saved');
  });
});

describe('authMode in config', () => {
  it('authMode defaults to "own" when not present', async () => {
    const { defaultConfig } = await import('@src/config.js');
    expect(defaultConfig.agent.model.authMode).toBe('own');
  });

  it('authMode="pi" is parsed correctly', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const cfg = ConfigSchema.parse({ agent: { model: { authMode: 'pi' } } });
    expect(cfg.agent.model.authMode).toBe('pi');
  });

  it('authMode="own" preserves provider/model/apiKey', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const cfg = ConfigSchema.parse({
      agent: { model: { authMode: 'own', provider: 'anthropic', id: 'claude-sonnet-4-5', apiKey: 'sk-test' } },
    });
    expect(cfg.agent.model.authMode).toBe('own');
    expect(cfg.agent.model.provider).toBe('anthropic');
    expect(cfg.agent.model.id).toBe('claude-sonnet-4-5');
    expect(cfg.agent.model.apiKey).toBe('sk-test');
  });

  it('config without authMode field defaults to "own" (legacy install)', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    // Write config without authMode — simulates legacy install
    writeFileSync(configPath, JSON.stringify({
      agent: { model: { provider: 'anthropic', id: 'claude-sonnet-4-5', apiKey: 'sk-legacy' } }
    }));
    const cfg = loadConfig(configPath);
    expect(cfg.agent.model.authMode).toBe('own');
  });
});

describe('search config defaults', () => {
  it('searxngBaseUrl defaults to http://localhost:8888', async () => {
    const { defaultConfig } = await import('@src/config.js');
    expect(defaultConfig.search.searxngBaseUrl).toBe('http://localhost:8888');
  });
});

describe('heartbeat config', () => {
  it('has default heartbeat block with enabled=false', async () => {
    const { defaultConfig } = await import('@src/config.js');
    expect(defaultConfig.heartbeat.enabled).toBe(false);
    expect(defaultConfig.heartbeat.interval).toBe('every 5m');
    expect(defaultConfig.heartbeat.contextId).toBe('main');
  });

  it('parses heartbeat block from config', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const cfg = ConfigSchema.parse({
      heartbeat: { enabled: true, interval: 'every 1m', contextId: 'work' },
    });
    expect(cfg.heartbeat.enabled).toBe(true);
    expect(cfg.heartbeat.interval).toBe('every 1m');
    expect(cfg.heartbeat.contextId).toBe('work');
  });
});
