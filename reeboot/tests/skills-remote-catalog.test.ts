/**
 * Remote catalog domain tests — fetch index + install a skill.
 *
 * Driven against a local fixture (temp manifest + zips) with an injected
 * fetcher — no live-network dependency. The module under test is
 * `src/skills/remote-catalog.ts` (does not exist yet → RED).
 */
import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import { crc32 as zlibCrc32 } from 'zlib';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  fetchCatalogIndex,
  listAvailable,
  installCatalogSkill,
  type CatalogIndex,
} from '../src/skills/remote-catalog.js';

function skillZip(name: string, extra?: (z: AdmZip) => void): Buffer {
  const zip = new AdmZip();
  zip.addFile('SKILL.md', Buffer.from(`---\nname: ${name}\ndescription: Catalog skill ${name}\n---\n# ${name}\n`));
  if (extra) extra(zip);
  return zip.toBuffer();
}

/**
 * Build a raw STORED zip whose entry name carries a path-traversal component
 * (`../`). adm-zip normalizes traversal away on `addFile`, so we write the
 * central/local headers by hand to produce a genuinely malicious archive.
 */
function rawZipWithTraversal(): Buffer {
  const crc32 = zlibCrc32;
  const name = Buffer.from('../evil.sh');
  const data = Buffer.from('#!/bin/sh\nrm -rf /\n');
  const crc = crc32(data) >>> 0;

  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0); // local file header signature
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(0, 8); // method: stored
  local.writeUInt16LE(0, 10); // mod time
  local.writeUInt16LE(0, 12); // mod date
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18); // compressed size
  local.writeUInt32LE(data.length, 22); // uncompressed size
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  name.copy(local, 30);

  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0); // central directory signature
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0, 8); // flags
  central.writeUInt16LE(0, 10); // method
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30); // extra len
  central.writeUInt16LE(0, 32); // comment len
  central.writeUInt16LE(0, 34); // disk start
  central.writeUInt16LE(0, 36); // int attrs
  central.writeUInt32LE(0, 38); // ext attrs
  central.writeUInt32LE(0, 42); // local header offset
  name.copy(central, 46);

  const cdSize = central.length;
  const cdOffset = local.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8); // entries on disk
  eocd.writeUInt16LE(1, 10); // total entries
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([local, data, central, eocd]);
}

function okJson(data: unknown): any {
  return { ok: true, json: () => Promise.resolve(data) };
}
function okZip(buf: Buffer): any {
  return { ok: true, arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)) };
}

interface Fixture {
  remoteDir: string;
  stateFile: string;
  zips: Record<string, Buffer>;
  index: CatalogIndex;
  indexUrl: string;
  cleanup: () => void;
}

function makeFixture(): Fixture {
  const remoteDir = mkdtempSync(join(tmpdir(), 'reeboot-remote-install-'));
  const stateFile = join(mkdtempSync(join(tmpdir(), 'reeboot-remote-state-')), 'skills-state.json');
  const zips: Record<string, Buffer> = {
    hubspot: skillZip('hubspot'),
    notion: skillZip('notion'),
    traversal: skillZip('traversal', (z) => z.addFile('../evil.sh', Buffer.from('rm -rf /'))),
  };
  const index: CatalogIndex = {
    name: 'fixture-catalog',
    skills: [
      { name: 'hubspot', description: 'Catalog skill hubspot', version: '1.0.0', category: 'crm', zip: 'http://local/zips/hubspot.zip' },
      { name: 'notion', description: 'Catalog skill notion', version: '1.0.0', category: 'productivity', zip: 'http://local/zips/notion.zip' },
    ],
    tools: [],
  };
  // Notion is installed first via the remote root to exercise collisions.
  mkdirSync(join(remoteDir, 'notion'), { recursive: true });
  writeFileSync(join(remoteDir, 'notion', 'SKILL.md'), '---\nname: notion\ndescription: preinstalled\n---\n');
  const fetcher = (url: string) => {
    if (url === 'http://local/index.json') return Promise.resolve(okJson(index));
    const key = url.split('/').pop()!;
    if (zips[key]) return Promise.resolve(okZip(zips[key]));
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  };
  return {
    remoteDir,
    stateFile,
    zips,
    index,
    indexUrl: 'http://local/index.json',
    cleanup: () => { rmSync(remoteDir, { recursive: true, force: true }); rmSync(join(stateFile, '..'), { recursive: true, force: true }); },
  } as any;
}

function config(fixture: Fixture) {
  return { skills: { remote_catalog_path: fixture.remoteDir, enabled_state_path: fixture.stateFile } };
}

describe('remote catalog — fetch + list + install', () => {
  it('(a) fetches and parses the manifest into available entries', async () => {
    const f = makeFixture();
    try {
      const res = await fetchCatalogIndex(f.indexUrl, () => Promise.resolve(okJson(f.index)) as any);
      expect(res.ok).toBe(true);
      expect(res.index!.skills.map((s) => s.name)).toEqual(['hubspot', 'notion']);
    } finally { f.cleanup(); }
  });

  it('(a2) fetcher failure surfaces an error', async () => {
    const f = makeFixture();
    try {
      const res = await fetchCatalogIndex(f.indexUrl, () => Promise.resolve({ ok: false, status: 500 }) as any);
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/500/i);
    } finally { f.cleanup(); }
  });

  it('(b) installing a valid fixture skill promotes into remote root and auto-enables', async () => {
    const f = makeFixture();
    try {
      const res = await installCatalogSkill('hubspot', { index: f.index, config: config(f) as any, fetcher: () => Promise.resolve(okZip(f.zips.hubspot)) });
      expect(res.ok).toBe(true);
      expect(res.name).toBe('hubspot');
      expect(res.source).toBe('remote');
      expect(res.enabled).toBe(true);
      expect(existsSync(join(f.remoteDir, 'hubspot', 'SKILL.md'))).toBe(true);
    } finally { f.cleanup(); }
  });

  it('(c) name collision rejects with no file change', async () => {
    const f = makeFixture();
    try {
      // 'notion' already exists in the remote root → collision.
      const res = await installCatalogSkill('notion', { index: f.index, config: config(f) as any, fetcher: () => Promise.resolve(okZip(f.zips.notion)) });
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/exists/i);
      expect(readFileSync(join(f.remoteDir, 'notion', 'SKILL.md'), 'utf-8')).toContain('preinstalled');
    } finally { f.cleanup(); }
  });

  it('(d) invalid zip (traversal) rejects and promotes nothing', async () => {
    const f = makeFixture();
    try {
      const badZip = rawZipWithTraversal();
      const res = await installCatalogSkill('hubspot', { index: f.index, config: config(f) as any, fetcher: () => Promise.resolve(okZip(badZip)) });
      expect(res.ok).toBe(false);
      expect(res.error).toBeTruthy();
      expect(existsSync(join(f.remoteDir, 'hubspot', 'SKILL.md'))).toBe(false);
    } finally { f.cleanup(); }
  });

  it('install of an unknown name rejects', async () => {
    const f = makeFixture();
    try {
      const res = await installCatalogSkill('nope', { index: f.index, config: config(f) as any });
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/not found/i);
    } finally { f.cleanup(); }
  });

  it('listAvailable flags collisions against installed skills', async () => {
    const f = makeFixture();
    try {
      const avail = listAvailable(f.index, config(f) as any);
      const notion = avail.find((s) => s.name === 'notion');
      const hubspot = avail.find((s) => s.name === 'hubspot');
      expect(notion!.collision).toBe(true);
      expect(hubspot!.collision).toBe(false);
    } finally { f.cleanup(); }
  });
});
