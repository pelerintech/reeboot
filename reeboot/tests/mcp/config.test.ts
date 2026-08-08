/**
 * Task 10 — `mcp` config block: server-side settings validated in the schema.
 *
 * The `mcp` block gains a `server` entry (apiKey) for the MCP-server surface,
 * alongside the existing client `servers` list. Missing defaults are applied and
 * a malformed block is rejected at parse.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ZodError } from 'zod';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-mcp-srv-config-'));
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

async function load(raw: unknown): Promise<any> {
  const { loadConfig } = await import('@src/config.js');
  const configPath = join(tmpDir, 'config.json');
  writeFileSync(configPath, JSON.stringify(raw));
  return loadConfig(configPath);
}

describe('mcp server config block', () => {
  it('parses mcp.server.apiKey', async () => {
    const cfg = await load({ mcp: { server: { apiKey: 'secret-token' } } });
    expect(cfg.mcp.server.apiKey).toBe('secret-token');
  });

  it('defaults mcp.server.apiKey to undefined when unset', async () => {
    const cfg = await load({ mcp: {} });
    expect(cfg.mcp.server.apiKey).toBeUndefined();
  });

  it('coexists with the client mcp.servers list', async () => {
    const cfg = await load({
      mcp: {
        servers: [{ name: 'pg', command: 'npx' }],
        server: { apiKey: 'k' },
      },
    });
    expect(cfg.mcp.servers[0].name).toBe('pg');
    expect(cfg.mcp.server.apiKey).toBe('k');
  });

  it('rejects a non-string apiKey', async () => {
    await expect(load({ mcp: { server: { apiKey: 123 } } })).rejects.toBeInstanceOf(ZodError);
  });
});
