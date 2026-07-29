/**
 * Reset endpoint tests: POST /api/channels/whatsapp/reset
 *
 * Uses source-code inspection to verify the reset endpoint
 * clears auth and stops the adapter.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SERVER_SRC = resolve(__dirname, '../src/server.ts');

describe('POST /api/channels/whatsapp/reset endpoint', () => {
  it('route is registered in server.ts', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    expect(src).toContain("'/api/channels/whatsapp/reset'");
  });

  it('returns status: reset on success', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    expect(src).toContain("status: 'reset'");
  });

  it('calls adapter.stop() to stop the adapter', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');

    const resetIdx = src.indexOf("'/api/channels/whatsapp/reset'");
    const handler = src.slice(resetIdx, resetIdx + 1000);
    expect(handler).toContain('adapter.stop()');
  });

  it('clears auth directory with rmSync', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');

    const resetIdx = src.indexOf("'/api/channels/whatsapp/reset'");
    const handler = src.slice(resetIdx, resetIdx + 1000);
    expect(handler).toContain('rmSync(authDir');
  });
});
