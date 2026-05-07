import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const INDEX_SRC = resolve(__dirname, '../../src/index.ts');

describe('reeboot logs --follow CLI command', () => {
  it('src/index.ts registers a logs command', () => {
    const src = readFileSync(INDEX_SRC, 'utf-8');
    expect(src).toMatch(/['"]logs['"]/);
  });

  it('src/index.ts handles --follow flag for logs command', () => {
    const src = readFileSync(INDEX_SRC, 'utf-8');
    expect(src).toContain('follow');
  });

  it('src/index.ts references /api/logs/stream in logs handler', () => {
    const src = readFileSync(INDEX_SRC, 'utf-8');
    expect(src).toContain('/api/logs/stream');
  });
});
