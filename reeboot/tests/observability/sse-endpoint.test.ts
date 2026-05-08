import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SERVER_SRC = resolve(__dirname, '../../src/server.ts');

describe('SSE endpoint in server', () => {
  it('server.ts references /api/logs/stream endpoint', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    expect(src).toContain('/api/logs/stream');
  });

  it('server.ts uses streamSSE for the logs endpoint', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    expect(src).toContain('streamSSE');
  });

  it('server.ts subscribes to sseEmitter for the stream', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    expect(src).toContain('sseEmitter');
  });

  it('server.ts applies level filtering on the stream', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    // Should use a level query param
    expect(src).toContain("query('level')");
  });
});
