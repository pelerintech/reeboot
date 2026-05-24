import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ConfigSchema comes from the reeboot package
const { ConfigSchema } = await import('../src/config.js');

describe('config.example.json', () => {
  // tests/docker-config-template.test.ts → repo root is two levels up
  const examplePath = resolve(__dirname, '..', '..', 'config.example.json');

  it('is valid JSON', () => {
    const raw = readFileSync(examplePath, 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('passes ConfigSchema.parse()', () => {
    const raw = readFileSync(examplePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(() => ConfigSchema.parse(parsed)).not.toThrow();
  });

  it('uses Docker DNS name for SearXNG', () => {
    const raw = readFileSync(examplePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.search.searxngBaseUrl).toBe('http://searxng:8080');
  });

  it('uses internal port for signal-cli (8080, not 8081)', () => {
    const raw = readFileSync(examplePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.channels.signal.apiPort).toBe(8080);
  });

  it('contains all top-level config sections', () => {
    const raw = readFileSync(examplePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const sections = [
      'agent', 'channels', 'sandbox', 'logging', 'server',
      'extensions', 'routing', 'session', 'credentialProxy',
      'search', 'heartbeat', 'skills', 'mcp', 'permissions',
      'security', 'contexts', 'memory', 'knowledge',
      'resilience', 'budget',
    ];
    for (const s of sections) {
      expect(parsed).toHaveProperty(s);
    }
  });
});