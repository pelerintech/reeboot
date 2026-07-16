/**
 * Config schema — sdk and ree fields
 *
 * Verifies that the Zod ConfigSchema declares `sdk` and `ree` fields
 * so they survive loadConfig() instead of being silently stripped.
 */

import { describe, it, expect } from 'vitest';
import { ConfigSchema } from '../src/config.js';

describe('ConfigSchema — sdk field', () => {
  it('parses sdk: "ree" from config', () => {
    const result = ConfigSchema.parse({ sdk: 'ree' });
    expect(result.sdk).toBe('ree');
  });

  it('defaults sdk to "pi" when absent', () => {
    const result = ConfigSchema.parse({});
    expect(result.sdk).toBe('pi');
  });

  it('rejects invalid sdk values', () => {
    expect(() => ConfigSchema.parse({ sdk: 'invalid' })).toThrow();
  });
});

describe('ConfigSchema — ree field', () => {
  it('defaults ree to empty object with defaults', () => {
    const result = ConfigSchema.parse({ sdk: 'ree' });
    expect(result.ree).toBeDefined();
    expect(result.ree.maxChats).toBe(200);
    expect(result.ree.idleTtlMs).toBe(1_800_000);
    expect(result.ree.maxHistoryPerChat).toBe(50);
    expect(result.ree.systemPrompt).toBe('');
    expect(result.ree.maxIterations).toBe(5);
  });

  it('parses ree.maxChats override', () => {
    const result = ConfigSchema.parse({ sdk: 'ree', ree: { maxChats: 50 } });
    expect(result.ree.maxChats).toBe(50);
  });

  it('parses ree.idleTtlMs override', () => {
    const result = ConfigSchema.parse({ sdk: 'ree', ree: { idleTtlMs: 60000 } });
    expect(result.ree.idleTtlMs).toBe(60000);
  });

  it('parses ree.systemPrompt', () => {
    const result = ConfigSchema.parse({ sdk: 'ree', ree: { systemPrompt: 'Be helpful' } });
    expect(result.ree.systemPrompt).toBe('Be helpful');
  });

  it('parses ree.maxIterations', () => {
    const result = ConfigSchema.parse({ sdk: 'ree', ree: { maxIterations: 10 } });
    expect(result.ree.maxIterations).toBe(10);
  });

  it('accepts ree.model as optional nested model config', () => {
    const result = ConfigSchema.parse({
      sdk: 'ree',
      ree: { model: { provider: 'custom', id: 'my-model' } },
    });
    expect(result.ree.model).toBeDefined();
    expect(result.ree.model?.provider).toBe('custom');
    expect(result.ree.model?.id).toBe('my-model');
  });

  it('accepts ree.mcp as optional MCP config', () => {
    const result = ConfigSchema.parse({
      sdk: 'ree',
      ree: { mcp: { servers: [{ name: 'test', command: 'echo' }] } },
    });
    expect(result.ree.mcp).toBeDefined();
    expect(result.ree.mcp?.servers).toHaveLength(1);
    expect(result.ree.mcp?.servers[0].name).toBe('test');
  });
});

describe('ConfigSchema — backward compatibility', () => {
  it('preserves all existing pi fields when sdk and ree are absent', () => {
    const result = ConfigSchema.parse({
      agent: { name: 'TestAgent' },
      channels: { web: { enabled: true, port: 3000 } },
    });
    expect(result.sdk).toBe('pi');
    expect(result.agent.name).toBe('TestAgent');
    expect(result.channels.web.enabled).toBe(true);
    expect(result.channels.web.port).toBe(3000);
  });
});
