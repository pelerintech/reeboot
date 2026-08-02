/**
 * Jina web reader — config block tests (TDD — written before implementation)
 *
 * Spec: config/spec.md
 *   - default web config: { jina_base_url: '', enabled: true, default_engine: 'auto' }
 *   - jina_base_url set → kept, enabled === true
 *   - enabled: false → respected
 *   - invalid default_engine → zod enum rejection
 *   - backward-compatible: config without web key still parses
 */

import { describe, it, expect } from 'vitest';
import { ConfigSchema } from '@src/config.js';

describe('config.web (Jina reader block)', () => {
  it('provides defaults when no web block is present', () => {
    const config = ConfigSchema.parse({});
    expect(config.web).toEqual({ jina_base_url: '', enabled: true, default_engine: 'auto' });
  });

  it('keeps jina_base_url value and defaults enabled to true', () => {
    const config = ConfigSchema.parse({ web: { jina_base_url: 'http://localhost:3000' } });
    expect(config.web.jina_base_url).toBe('http://localhost:3000');
    expect(config.web.enabled).toBe(true);
    expect(config.web.default_engine).toBe('auto');
  });

  it('respects enabled: false', () => {
    const config = ConfigSchema.parse({ web: { jina_base_url: 'http://localhost:3000', enabled: false } });
    expect(config.web.enabled).toBe(false);
  });

  it('rejects an invalid default_engine value (zod enum)', () => {
    expect(() => ConfigSchema.parse({ web: { default_engine: 'bad' } })).toThrow();
  });

  it('is backward-compatible — a previously-valid config without web still parses', () => {
    const config = ConfigSchema.parse({ sdk: 'pi', search: { provider: 'duckduckgo' } });
    expect(config.web).toBeDefined();
    expect(config.web.jina_base_url).toBe('');
  });
});
