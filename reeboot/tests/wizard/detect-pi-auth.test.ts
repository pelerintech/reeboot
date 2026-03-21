import { describe, it, expect, vi, afterEach } from 'vitest';
import { join } from 'path';
import { homedir } from 'os';

const PI_AGENT_DIR = join(homedir(), '.pi', 'agent');

describe('detectPiAuth', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('returns available=true when auth.json has providers and settings.json has default', async () => {
    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs');
      return {
        ...actual,
        existsSync: (p: string) => {
          if (p === join(PI_AGENT_DIR, 'auth.json')) return true;
          if (p === join(PI_AGENT_DIR, 'settings.json')) return true;
          return actual.existsSync(p);
        },
        readFileSync: (p: string, enc?: any) => {
          if (p === join(PI_AGENT_DIR, 'auth.json'))
            return JSON.stringify({ anthropic: { type: 'oauth' } });
          if (p === join(PI_AGENT_DIR, 'settings.json'))
            return JSON.stringify({ defaultProvider: 'anthropic', defaultModel: 'claude-sonnet-4-5' });
          return actual.readFileSync(p, enc);
        },
      };
    });

    const { detectPiAuth } = await import('@src/wizard/detect-pi-auth.js');
    const result = await detectPiAuth();
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-sonnet-4-5');
    }
  });

  it('returns available=false when auth.json does not exist', async () => {
    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs');
      return {
        ...actual,
        existsSync: (p: string) => {
          if (p === join(PI_AGENT_DIR, 'auth.json')) return false;
          return actual.existsSync(p);
        },
      };
    });

    const { detectPiAuth } = await import('@src/wizard/detect-pi-auth.js');
    const result = await detectPiAuth();
    expect(result.available).toBe(false);
  });

  it('returns available=false when auth.json has no providers (empty object)', async () => {
    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs');
      return {
        ...actual,
        existsSync: (p: string) => {
          if (p === join(PI_AGENT_DIR, 'auth.json')) return true;
          if (p === join(PI_AGENT_DIR, 'settings.json')) return true;
          return actual.existsSync(p);
        },
        readFileSync: (p: string, enc?: any) => {
          if (p === join(PI_AGENT_DIR, 'auth.json')) return JSON.stringify({});
          if (p === join(PI_AGENT_DIR, 'settings.json'))
            return JSON.stringify({ defaultProvider: 'anthropic', defaultModel: 'claude-sonnet-4-5' });
          return actual.readFileSync(p, enc);
        },
      };
    });

    const { detectPiAuth } = await import('@src/wizard/detect-pi-auth.js');
    const result = await detectPiAuth();
    expect(result.available).toBe(false);
  });
});
