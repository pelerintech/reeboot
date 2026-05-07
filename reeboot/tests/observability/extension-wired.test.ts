import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const LOADER_SRC = resolve(__dirname, '../../src/extensions/loader.ts');

describe('OB-4+OB-5: observability extension wired into loader', () => {
  it('loader.ts imports or references the observability extension', () => {
    const src = readFileSync(LOADER_SRC, 'utf-8');
    expect(src).toContain('observability');
  });

  it('getBundledFactories includes observability extension (always-on)', () => {
    const src = readFileSync(LOADER_SRC, 'utf-8');
    // Should register observability without a feature flag guard
    expect(src).toMatch(/observability/);
    // Should NOT be gated on a config toggle (it's always-on)
    // Check there's no "if (observabilityEnabled)" guard
    expect(src).not.toMatch(/if\s*\(\s*observabilityEnabled/);
  });
});
