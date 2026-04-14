/**
 * MCP Config Schema Tests
 *
 * Covers:
 *   - valid mcp.servers entry is parsed correctly
 *   - missing mcp key defaults to empty servers array
 *   - server missing `name` throws ZodError
 *   - server missing `command` throws ZodError
 *   - server with no `args`/`env` gets correct defaults
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-mcp-config-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('mcp config schema', () => {
  it('parses a valid mcp.servers entry', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      mcp: {
        servers: [
          {
            name: 'postgres',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-postgres'],
            env: { DATABASE_URL: 'postgres://localhost/mydb' },
          },
        ],
      },
    }));
    const cfg = loadConfig(configPath);
    expect(cfg.mcp.servers).toHaveLength(1);
    expect(cfg.mcp.servers[0].name).toBe('postgres');
    expect(cfg.mcp.servers[0].command).toBe('npx');
    expect(cfg.mcp.servers[0].args).toEqual(['-y', '@modelcontextprotocol/server-postgres']);
    expect(cfg.mcp.servers[0].env).toEqual({ DATABASE_URL: 'postgres://localhost/mydb' });
  });

  it('defaults mcp.servers to [] when mcp key is absent', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ agent: { name: 'Reeboot' } }));
    const cfg = loadConfig(configPath);
    expect(cfg.mcp.servers).toEqual([]);
  });

  it('throws ZodError when server is missing name', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      mcp: { servers: [{ command: 'npx', args: [] }] },
    }));
    expect(() => loadConfig(configPath)).toThrow();
  });

  it('throws ZodError when server is missing command', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      mcp: { servers: [{ name: 'postgres' }] },
    }));
    expect(() => loadConfig(configPath)).toThrow();
  });

  it('defaults args to [] and env to {} when omitted', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      mcp: { servers: [{ name: 'postgres', command: 'pg-mcp' }] },
    }));
    const cfg = loadConfig(configPath);
    expect(cfg.mcp.servers[0].args).toEqual([]);
    expect(cfg.mcp.servers[0].env).toEqual({});
  });

  it('parses declared permissions from mcp.servers entry', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      mcp: {
        servers: [
          {
            name: 'web-fetcher',
            command: 'npx',
            args: ['-y', '@my/web-fetcher-mcp'],
            permissions: { network: true, filesystem: false },
          },
        ],
      },
    }));
    const cfg = loadConfig(configPath);
    expect(cfg.mcp.servers[0].permissions.network).toBe(true);
    expect(cfg.mcp.servers[0].permissions.filesystem).toBe(false);
  });

  it('defaults permissions to deny-all when permissions field is absent', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      mcp: { servers: [{ name: 'postgres', command: 'pg-mcp' }] },
    }));
    const cfg = loadConfig(configPath);
    expect(cfg.mcp.servers[0].permissions.network).toBe(false);
    expect(cfg.mcp.servers[0].permissions.filesystem).toBe(false);
  });
});

describe('top-level permissions block', () => {
  it('parses permissions.violations.log when set to false', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      permissions: { violations: { log: false } },
    }));
    const cfg = loadConfig(configPath);
    expect(cfg.permissions.violations.log).toBe(false);
  });

  it('defaults permissions.violations.log to true when permissions field is absent', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ agent: { name: 'Reeboot' } }));
    const cfg = loadConfig(configPath);
    expect(cfg.permissions.violations.log).toBe(true);
  });
});
