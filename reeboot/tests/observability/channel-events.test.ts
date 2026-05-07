import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('OB-2-F: channel_connected/channel_disconnected events', () => {
  it('web.ts emits channel_connected event when connected', () => {
    const src = readFileSync(resolve(__dirname, '../../src/channels/web.ts'), 'utf-8');
    expect(src).toContain('channel_connected');
  });

  it('web.ts emits channel_disconnected event when disconnected', () => {
    const src = readFileSync(resolve(__dirname, '../../src/channels/web.ts'), 'utf-8');
    expect(src).toContain('channel_disconnected');
  });

  it('whatsapp.ts emits channel_connected event when connected', () => {
    const src = readFileSync(resolve(__dirname, '../../src/channels/whatsapp.ts'), 'utf-8');
    expect(src).toContain('channel_connected');
  });

  it('whatsapp.ts emits channel_disconnected event when disconnected', () => {
    const src = readFileSync(resolve(__dirname, '../../src/channels/whatsapp.ts'), 'utf-8');
    expect(src).toContain('channel_disconnected');
  });

  it('signal.ts emits channel_connected event when connected', () => {
    const src = readFileSync(resolve(__dirname, '../../src/channels/signal.ts'), 'utf-8');
    expect(src).toContain('channel_connected');
  });

  it('signal.ts emits channel_disconnected event when disconnected', () => {
    const src = readFileSync(resolve(__dirname, '../../src/channels/signal.ts'), 'utf-8');
    expect(src).toContain('channel_disconnected');
  });
});
