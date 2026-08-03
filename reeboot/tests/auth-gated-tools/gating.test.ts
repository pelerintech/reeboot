import { describe, it, expect } from 'vitest';
import { applyAuthLevel } from '@src/extensions/ree-adapter.js';
import type { ToolDefinition, AuthLevel } from '@src/extensions/extension-api.js';

function tool(name: string, minAuthLevel?: AuthLevel): ToolDefinition {
  return {
    name,
    label: name,
    description: name,
    parameters: {},
    ...(minAuthLevel ? { minAuthLevel } : {}),
    execute: async () => ({ content: name }),
  };
}

describe('auth-level tool gating', () => {
  it('hides gated tools at the anonymous level', () => {
    const registry = new Map<string, ToolDefinition>([
      ['baseline', tool('baseline')],
      ['secret', tool('secret', 'customer')],
    ]);
    const visible = applyAuthLevel(registry, 'anonymous').map((t) => t.name);
    expect(visible).toContain('baseline');
    expect(visible).not.toContain('secret');
  });

  it('reveals the customer tool when the level is raised, but not admin', () => {
    const registry = new Map<string, ToolDefinition>([
      ['secret', tool('secret', 'customer')],
      ['admin', tool('admin', 'admin')],
    ]);
    const visible = applyAuthLevel(registry, 'customer').map((t) => t.name);
    expect(visible).toContain('secret');
    expect(visible).not.toContain('admin');
  });
});
