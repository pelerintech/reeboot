/**
 * pi-registry-factory.test.ts
 *
 * Verifies that ModelRegistry exposes a static .create() factory and that
 * the constructor is not directly callable (as of @mariozechner/pi-coding-agent 0.64+).
 */

import { describe, it, expect } from 'vitest';
import { ModelRegistry, AuthStorage } from '@mariozechner/pi-coding-agent';

describe('ModelRegistry API shape (0.64+)', () => {
  it('exposes a static create() factory function', () => {
    expect(typeof (ModelRegistry as any).create).toBe('function');
  });

  it('create() with a real AuthStorage.inMemory() does not throw', () => {
    const authStorage = AuthStorage.inMemory();
    expect(() =>
      (ModelRegistry as any).create(authStorage, '/nonexistent/models.json')
    ).not.toThrow();
  });

  it('create() returns a ModelRegistry instance', () => {
    const authStorage = AuthStorage.inMemory();
    const registry = (ModelRegistry as any).create(authStorage, '/nonexistent/models.json');
    expect(registry).toBeInstanceOf(ModelRegistry);
  });
});
