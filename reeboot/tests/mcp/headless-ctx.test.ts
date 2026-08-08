/**
 * Task 2 — Headless ExtensionContext synthesizer.
 *
 * Pass-through MCP calls have no live agent session. We synthesize a standard
 * ExtensionContext: hasUI=false, no-op ui, scratch workspace, plus the app's
 * config/db/modelRegistry so self-contained tools run unchanged.
 */
import { describe, it, expect } from 'vitest';
import { buildHeadlessContext } from '@src/extensions/mcp-headless.js';

describe('buildHeadlessContext', () => {
  it('marks hasUI false and provides a no-op ui', () => {
    const ctx = buildHeadlessContext({ workspacePath: '/tmp/w', config: {}, db: null, modelRegistry: undefined });
    expect(ctx.hasUI).toBe(false);
    expect(ctx.ui.select).toBeTypeOf('function');
    expect(ctx.ui.confirm).toBeTypeOf('function');
    expect(ctx.ui.input).toBeTypeOf('function');
    expect(ctx.ui.notify).toBeTypeOf('function');
  });

  it('passes through config, db and modelRegistry', () => {
    const config = { memory: { enabled: true } };
    const db = { prepare: () => null };
    const modelRegistry = { get: () => 'x' };
    const ctx = buildHeadlessContext({ workspacePath: '/tmp/w', config, db, modelRegistry });
    expect(ctx.config).toBe(config);
    expect(ctx.db).toBe(db);
    expect(ctx.modelRegistry).toBe(modelRegistry);
  });

  it('exposes scratch cwd and workspacePath', () => {
    const ctx = buildHeadlessContext({ workspacePath: '/tmp/w', config: {}, db: null, modelRegistry: undefined });
    expect(ctx.workspacePath).toBe('/tmp/w');
    expect(ctx.cwd).toBeTypeOf('string');
  });
});
