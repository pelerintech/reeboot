import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

function writeTmpConfig(obj: Record<string, unknown>): string {
  const dir = join(tmpdir(), `reeboot-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'config.json');
  writeFileSync(path, JSON.stringify(obj), 'utf-8');
  return path;
}

describe('knowledge config schema', () => {
  it('applies defaults when no knowledge key is present', () => {
    const path = writeTmpConfig({});
    const config = loadConfig(path);

    expect(config.knowledge).toBeDefined();
    expect(config.knowledge.enabled).toBe(false);
    expect(config.knowledge.embeddingModel).toBe('nomic-ai/nomic-embed-text-v1.5');
    expect(config.knowledge.dimensions).toBe(768);
    expect(config.knowledge.chunkSize).toBe(512);
    expect(config.knowledge.chunkOverlap).toBe(64);
    expect(config.knowledge.wiki).toBeDefined();
    expect(config.knowledge.wiki.enabled).toBe(false);
    expect(config.knowledge.wiki.lint.schedule).toBe('0 9 * * 1');
  });

  it('respects explicit knowledge.enabled and knowledge.dimensions overrides', () => {
    const path = writeTmpConfig({
      knowledge: {
        enabled: true,
        dimensions: 512,
      },
    });
    const config = loadConfig(path);

    expect(config.knowledge.enabled).toBe(true);
    expect(config.knowledge.dimensions).toBe(512);
    // Other fields still default
    expect(config.knowledge.embeddingModel).toBe('nomic-ai/nomic-embed-text-v1.5');
    expect(config.knowledge.chunkSize).toBe(512);
    expect(config.knowledge.chunkOverlap).toBe(64);
  });

  it('respects wiki.enabled override while keeping lint schedule default', () => {
    const path = writeTmpConfig({
      knowledge: {
        enabled: true,
        wiki: { enabled: true },
      },
    });
    const config = loadConfig(path);

    expect(config.knowledge.wiki.enabled).toBe(true);
    expect(config.knowledge.wiki.lint.schedule).toBe('0 9 * * 1');
  });

  it('respects custom wiki lint schedule', () => {
    const path = writeTmpConfig({
      knowledge: {
        wiki: {
          enabled: true,
          lint: { schedule: '0 8 * * *' },
        },
      },
    });
    const config = loadConfig(path);

    expect(config.knowledge.wiki.lint.schedule).toBe('0 8 * * *');
  });
});
