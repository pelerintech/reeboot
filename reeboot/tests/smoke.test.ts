/**
 * Post-build smoke tests
 *
 * These tests run against the compiled dist/ output — NOT source via vitest aliases.
 * They catch ESM/CJS import errors, missing named exports, and require()-in-ESM
 * bugs that TypeScript and unit tests both miss (because unit tests mock modules).
 *
 * IMPORTANT: These tests require `npm run build` to have been run first.
 * They are intentionally excluded from the default `npm test` (watch mode)
 * and run only via `npm run check` (build + test:run).
 */

import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');

// ─── Guard ────────────────────────────────────────────────────────────────────

function requiresDist() {
  if (!existsSync(distDir)) {
    throw new Error(
      'dist/ not found — run `npm run build` before `npm run test:run` or use `npm run check`'
    );
  }
}

// ─── dist/ import smoke tests ─────────────────────────────────────────────────

describe('dist/ smoke — ESM import sanity', () => {
  it('dist/ directory exists', () => {
    requiresDist();
    expect(existsSync(distDir)).toBe(true);
  });

  it('dist/db/schema.js imports without error (catches require()-in-ESM and bad named exports)', async () => {
    requiresDist();
    await expect(import(resolve(distDir, 'db/schema.js'))).resolves.toBeDefined();
  });

  it('dist/scheduler.js imports without error (catches missing node-cron and cron-parser issues)', async () => {
    requiresDist();
    await expect(import(resolve(distDir, 'scheduler.js'))).resolves.toBeDefined();
  });

  it('dist/channels/whatsapp.js imports without error', async () => {
    requiresDist();
    await expect(import(resolve(distDir, 'channels/whatsapp.js'))).resolves.toBeDefined();
  });

  it('dist/channels/signal.js imports without error', async () => {
    requiresDist();
    await expect(import(resolve(distDir, 'channels/signal.js'))).resolves.toBeDefined();
  });

  it('dist/server.js imports without error', async () => {
    requiresDist();
    await expect(import(resolve(distDir, 'server.js'))).resolves.toBeDefined();
  });
});

// ─── dist/ export shape ───────────────────────────────────────────────────────

describe('dist/ smoke — exported shapes', () => {
  it('dist/channels/interface.js exports ChannelAdapter-compatible shape', async () => {
    requiresDist();
    const mod = await import(resolve(distDir, 'channels/interface.js'));
    expect(mod.createIncomingMessage).toBeDefined();
    expect(typeof mod.createIncomingMessage).toBe('function');
    expect(mod.MessageBus).toBeDefined();
  });

  it('dist/channels/whatsapp.js exports linkWhatsAppDevice', async () => {
    requiresDist();
    const mod = await import(resolve(distDir, 'channels/whatsapp.js'));
    expect(typeof mod.linkWhatsAppDevice).toBe('function');
  });

  it('dist/scheduler.js exports Scheduler class', async () => {
    requiresDist();
    const mod = await import(resolve(distDir, 'scheduler.js'));
    expect(mod.Scheduler).toBeDefined();
  });

  it('dist/db/schema.js exports runMigration', async () => {
    requiresDist();
    const mod = await import(resolve(distDir, 'db/schema.js'));
    expect(typeof mod.runMigration).toBe('function');
  });
});
