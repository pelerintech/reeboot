/**
 * QR endpoint coordination tests: adapter stop/start lifecycle
 *
 * Uses source-code inspection to verify the QR endpoint properly stops the
 * adapter before linking and starts it after successful link.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SERVER_SRC = resolve(__dirname, '../src/server.ts');

describe('QR endpoint adapter coordination', () => {
  it('calls adapter.stop() before linkWhatsAppDevice in the QR handler', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');

    // Find the QR handler block
    const handlerStart = "app.post('/api/channels/whatsapp/qr'";
    const handlerEnd = "// ── Reload & Restart";
    const startIdx = src.indexOf(handlerStart);
    const endIdx = src.indexOf(handlerEnd, startIdx);
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(-1);
    const handler = src.slice(startIdx, endIdx);

    const stopIdx = handler.indexOf('adapter.stop()');
    const linkIdx = handler.indexOf('linkWhatsAppDevice');
    expect(stopIdx).toBeGreaterThan(-1);
    expect(linkIdx).toBeGreaterThan(-1);
    expect(stopIdx).toBeLessThan(linkIdx);
  });

  it('calls adapter.start() inside the onSuccess callback', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');

    const handlerStart = "app.post('/api/channels/whatsapp/qr'";
    const handlerEnd = "// ── Reload & Restart";
    const startIdx = src.indexOf(handlerStart);
    const endIdx = src.indexOf(handlerEnd, startIdx);
    const handler = src.slice(startIdx, endIdx);

    const onSuccessIdx = handler.indexOf('onSuccess:');
    expect(onSuccessIdx).toBeGreaterThan(-1);

    // Look at the block from onSuccess: to the next callback key
    const afterOnSuccess = handler.slice(onSuccessIdx);
    const nextKey = afterOnSuccess.search(/,\s*\n\s+(onTimeout|timeoutMs)\s*[:=]/);
    const blockLen = nextKey > -1 ? nextKey : 300;
    const onSuccessBlock = afterOnSuccess.slice(0, blockLen);

    expect(onSuccessBlock).toContain('adapter.start()');
  });

  it('wipes auth directory before starting link flow', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');

    const handlerStart = "app.post('/api/channels/whatsapp/qr'";
    const handlerEnd = "// ── Reload & Restart";
    const startIdx = src.indexOf(handlerStart);
    const endIdx = src.indexOf(handlerEnd, startIdx);
    const handler = src.slice(startIdx, endIdx);

    const rmIdx = handler.indexOf('rmSync(authDir');
    const linkIdx = handler.indexOf('linkWhatsAppDevice');
    expect(rmIdx).toBeGreaterThan(-1);
    expect(linkIdx).toBeGreaterThan(-1);
    expect(rmIdx).toBeLessThan(linkIdx);
  });
});
