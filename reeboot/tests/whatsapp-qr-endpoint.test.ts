/**
 * QR endpoint source-code tests: POST /api/channels/whatsapp/qr
 *
 * Uses source-code inspection (same pattern as sse-endpoint.test.ts)
 * to verify the route is registered in server.ts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SERVER_SRC = resolve(__dirname, '../src/server.ts');

describe('POST /api/channels/whatsapp/qr endpoint', () => {
  it('route is registered in server.ts', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    expect(src).toContain("'/api/channels/whatsapp/qr'");
  });

  it('uses linkWhatsAppDevice from the whatsapp channel', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    expect(src).toContain('linkWhatsAppDevice');
  });

  it('renders QR to data URL via qrcode.toDataURL', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    expect(src).toContain('toDataURL');
  });

  it('calls adapter.stop() before starting link flow', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    expect(src).toContain('adapter.stop()');
  });

  it('calls adapter.start() on successful link (onSuccess)', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    expect(src).toContain('adapter.start()');
  });
});
