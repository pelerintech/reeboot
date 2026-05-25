import { describe, it, expect } from 'vitest';

/**
 * MCP credential filtering tests.
 *
 * Verifies that:
 * 1. MCP subprocesses receive only safe env vars + explicitly configured env
 * 2. XDG_* vars are passed through
 * 3. Credential patterns in error messages are redacted
 */

describe('MCP credential filtering — redactCredentials', () => {
  async function getRedact() {
    const mod = await import('@src/extensions/mcp-manager.js');
    return mod.redactCredentials;
  }

  it('redacts GitHub PAT', async () => {
    const redact = await getRedact();
    const result = redact('Authentication failed: ghp_abc123def456ghi789jkl012mno345pqr678stu');
    expect(result).toContain('[REDACTED-GITHUB-TOKEN]');
    expect(result).not.toContain('ghp_abc');
  });

  it('redacts OpenAI key', async () => {
    const redact = await getRedact();
    const result = redact('Invalid key: sk-proj-abc123xyz789def456ghi');
    expect(result).toContain('[REDACTED-OPENAI-KEY]');
    expect(result).not.toContain('sk-proj');
  });

  it('redacts Bearer token', async () => {
    const redact = await getRedact();
    const result = redact('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(result).toContain('Bearer [REDACTED]');
    expect(result).not.toContain('eyJhbGci');
  });

  it('redacts key=value credentials', async () => {
    const redact = await getRedact();
    const result = redact('connection failed: api_key=sk-live-12345&region=us');
    // API_KEY pattern is case-insensitive — replacement uses uppercase
    expect(result).toContain('API_KEY=[REDACTED]');
    expect(result).not.toContain('sk-live');
  });

  it('does not redact safe text', async () => {
    const redact = await getRedact();
    const result = redact('File not found: /tmp/missing.txt');
    expect(result).toBe('File not found: /tmp/missing.txt');
  });

  it('handles empty string', async () => {
    const redact = await getRedact();
    const result = redact('');
    expect(result).toBe('');
  });
});

describe('MCP credential filtering — env var filtering', () => {
  it('filters process.env to only safe env vars', async () => {
    const { filterEnv } = await import('@src/extensions/mcp-manager.js');
    const safeEnv = filterEnv({
      PATH: '/usr/bin',
      HOME: '/home/user',
      USER: 'bob',
      LANG: 'en_US.UTF-8',
      OPENAI_API_KEY: 'sk-secret',
      GITHUB_TOKEN: 'ghp_secret',
      AWS_SECRET: 'secret123',
    });
    expect(safeEnv.PATH).toBe('/usr/bin');
    expect(safeEnv.HOME).toBe('/home/user');
    expect(safeEnv.OPENAI_API_KEY).toBeUndefined();
    expect(safeEnv.GITHUB_TOKEN).toBeUndefined();
    expect(safeEnv.AWS_SECRET).toBeUndefined();
  });

  it('XDG_* vars are passed through', async () => {
    const { filterEnv } = await import('@src/extensions/mcp-manager.js');
    const safeEnv = filterEnv({
      XDG_CONFIG_HOME: '/home/user/.config',
      XDG_DATA_HOME: '/home/user/.local/share',
      OPENAI_API_KEY: 'sk-secret',
      PATH: '/usr/bin',
    });
    expect(safeEnv.XDG_CONFIG_HOME).toBe('/home/user/.config');
    expect(safeEnv.XDG_DATA_HOME).toBe('/home/user/.local/share');
    expect(safeEnv.OPENAI_API_KEY).toBeUndefined();
    expect(safeEnv.PATH).toBe('/usr/bin');
  });

  it('passes explicitly configured env vars', async () => {
    const { filterEnv } = await import('@src/extensions/mcp-manager.js');
    const safeEnv = filterEnv(
      { PATH: '/usr/bin', GITHUB_TOKEN: 'ghp_secret' },
      { GITHUB_TOKEN: 'ghp_configured' },
    );
    expect(safeEnv.PATH).toBe('/usr/bin');
    expect(safeEnv.GITHUB_TOKEN).toBe('ghp_configured');
  });
});