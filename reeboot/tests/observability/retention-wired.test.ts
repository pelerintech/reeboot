import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SERVER_SRC = resolve(__dirname, '../../src/server.ts');

describe('OB-1-E: pruneObservabilityData wired into server startup', () => {
  it('server.ts imports pruneObservabilityData', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    expect(src).toContain('pruneObservabilityData');
  });

  it('server.ts calls pruneObservabilityData at startup', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    // Must be a function call, not just an import
    expect(src).toMatch(/pruneObservabilityData\s*\(/);
  });
});
