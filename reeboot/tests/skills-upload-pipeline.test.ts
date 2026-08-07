/**
 * Skill zip validation tests (Layer 1).
 *
 * Verifies the pure validateSkillZip() function against traversal, bombs,
 * disallowed types, missing SKILL.md, and a valid archive.
 */
import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import { validateSkillZip } from '../src/skills/zip-validate.js';

function buildZip(files: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8'));
  }
  return zip.toBuffer();
}

const SKILL = '# Demo\n---\nname: demo\n---\ndescription placeholder\n';

/**
 * Build a zip then byte-replace a same-length placeholder entry name so the
 * stored name contains traversal that adm-zip would otherwise normalize away.
 */
function buildZipWithName(placeholder: string, target: string): Buffer {
  if (placeholder.length !== target.length) throw new Error('same length required');
  const zip = new AdmZip();
  zip.addFile('SKILL.md', Buffer.from(SKILL, 'utf-8'));
  zip.addFile(placeholder, Buffer.from('x', 'utf-8'));
  const buf = zip.toBuffer();
  const haystack = Buffer.from(placeholder, 'utf-8');
  const needle = Buffer.from(target, 'utf-8');
  let out = buf;
  let idx = out.indexOf(haystack);
  while (idx !== -1) {
    needle.copy(out, idx);
    idx = out.indexOf(haystack, idx + needle.length);
  }
  return out;
}

describe('validateSkillZip', () => {
  it('accepts a valid skill zip', () => {
    const buf = buildZip({ 'SKILL.md': SKILL, 'lib.js': 'const x=1;' });
    expect(validateSkillZip(buf).ok).toBe(true);
  });

  it('rejects an entry with .. traversal', () => {
    const buf = buildZipWithName('a/evil.jsx', '../evil.js');
    const res = validateSkillZip(buf);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/path/i);
  });

  it('rejects an absolute-path entry', () => {
    const buf = buildZipWithName('xetc/passwd', '/etc/passwd');
    expect(validateSkillZip(buf).ok).toBe(false);
  });

  it('rejects a disallowed file type', () => {
    const buf = buildZip({ 'SKILL.md': SKILL, 'virus.exe': 'MZ' });
    expect(validateSkillZip(buf).ok).toBe(false);
  });

  it('rejects a symlink entry (UP-6)', () => {
    const zip = new AdmZip();
    zip.addFile('SKILL.md', Buffer.from(SKILL, 'utf-8'));
    zip.addFile('helper.js', Buffer.from('/etc/passwd', 'utf-8'));
    const entry = zip.getEntry('helper.js')!;
    // Mark as a unix symlink (S_IFLNK | 0755) in the external file attributes.
    entry.attr = 0xa1ed0000;
    expect(validateSkillZip(zip.toBuffer()).ok).toBe(false);
  });

  it('rejects a zip with no SKILL.md at root', () => {
    const buf = buildZip({ 'lib.js': 'x' });
    expect(validateSkillZip(buf).ok).toBe(false);
  });

  it('rejects a non-zip buffer', () => {
    expect(validateSkillZip(Buffer.from('not a zip')).ok).toBe(false);
  });

  it('rejects a decompression-bomb ratio or oversized archive', () => {
    // A highly-compressible large blob (many zeros) to trigger ratio/size caps.
    const buf = buildZip({ 'SKILL.md': SKILL, 'big.bin': Buffer.alloc(64 * 1024 * 1024, 0) });
    expect(validateSkillZip(buf).ok).toBe(false);
  });
});
