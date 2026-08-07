/**
 * Skill zip upload validation (Layer 1 — package validation).
 *
 * Pure, SDK-agnostic validation of a user-supplied zip buffer BEFORE any
 * extraction or promotion. Inspects the zip central directory only. Content
 * trust (Layer 2) is delegated to existing agent security policies.
 *
 * Rejections: path traversal (`..` / absolute), disallowed file types,
 * decompression bombs (total expanded size / ratio caps), excessive entry
 * counts, and missing `SKILL.md` at the archive root.
 */
import AdmZip from 'adm-zip';

/** Allowed root-level skill marker. */
export const SKILL_MD = 'SKILL.md';

/** Allowlisted file types (lowercased extension). */
const ALLOWED_EXTENSIONS = new Set([
  '.md', '.markdown', '.js', '.mjs', '.cjs', '.ts', '.json', '.txt',
  '.yaml', '.yml', '.toml', '.csv', '.html', '.css', '.svg',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.sh', '.py', '.ps1',
]);

const MAX_ENTRY_COUNT = 200;
const MAX_TOTAL_EXPANDED_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_SINGLE_ENTRY_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_RATIO = 200; // uncompressed / compressed ratio bomb guard

export interface ZipValidationResult {
  ok: boolean;
  error?: string;
}

/** True if the entry name is a plain basename (no separators). */
function isRootName(name: string): boolean {
  return name.length > 0 && !name.includes('/') && !name.includes('\\');
}

/** Reject `..`, leading-/absolute, and backslash-normalised traversal. */
function hasTraversal(name: string): boolean {
  const norm = name.replace(/\\/g, '/');
  if (norm.startsWith('/')) return true;
  const segments = norm.split('/').filter((s) => s.length > 0);
  return segments.some((s) => s === '..' || s === '.' || s.includes('\\'));
}

/**
 * True if the entry is a unix special file (symlink / device / fifo / socket)
 * rather than a regular file or a plain DOS entry. The unix file type lives in
 * the high 16 bits of the external file attributes (S_IFMT mask): 0x8000 is a
 * regular file, 0x1000 FIFO, 0x2000 char device, 0x6000 block device, 0xA000
 * symlink, 0xC000 socket. 0x0000 is an unknown/DOS entry (no unix mode).
 */
function isSpecialFile(entry: { attr?: number }): boolean {
  if (entry.attr === undefined) return false;
  const modeType = ((entry.attr >>> 0) >> 16) & 0xf000;
  // Regular file (0x8000) and unknown/DOS (0x0000) are permitted; anything
  // else is a special unix entry we must not extract (symlinks, devices, ...).
  if (modeType === 0 || modeType === 0x8000) return false;
  return true;
}

function disallowedType(name: string): boolean {
  const lower = name.toLowerCase();
  const idx = lower.lastIndexOf('.');
  if (idx === -1) return true; // no extension
  return !ALLOWED_EXTENSIONS.has(lower.slice(idx));
}

/**
 * Validate a zip buffer against the Layer-1 rules. Does not extract anything.
 * If the buffer is not a valid zip, returns { ok:false, error: 'invalid zip' }.
 */
export function validateSkillZip(buffer: Buffer): ZipValidationResult {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    return { ok: false, error: 'Invalid zip archive' };
  }

  let entries;
  try {
    entries = zip.getEntries();
  } catch {
    return { ok: false, error: 'Invalid zip archive' };
  }

  if (entries.length === 0) return { ok: false, error: 'Zip is empty' };
  if (entries.length > MAX_ENTRY_COUNT) {
    return { ok: false, error: `Too many entries (${entries.length} > ${MAX_ENTRY_COUNT})` };
  }

  let hasRootSkillMd = false;
  let totalExpanded = 0;

  for (const entry of entries) {
    const name = entry.entryName;
    if (name === SKILL_MD) hasRootSkillMd = true;

    if (hasTraversal(name)) {
      return { ok: false, error: `Disallowed path in archive: ${name}` };
    }

    if (entry.isDirectory) continue;

    // Reject unix special entries (symlink / device / fifo / socket) — never
    // extract them. Symlink and device entries are called out in UP-6.
    if (isSpecialFile(entry)) {
      return { ok: false, error: `Disallowed file type: ${name}` };
    }

    if (disallowedType(name)) {
      return { ok: false, error: `Disallowed file type: ${name}` };
    }

    // Expanded-size caps (header.size = uncompressed size).
    const expanded = entry.header.size ?? 0;
    if (expanded > MAX_SINGLE_ENTRY_BYTES) {
      return { ok: false, error: `Entry too large: ${name}` };
    }
    totalExpanded += expanded;
    if (totalExpanded > MAX_TOTAL_EXPANDED_BYTES) {
      return { ok: false, error: 'Archive exceeds expanded-size cap' };
    }

    // Decompression-ratio bomb guard.
    const compressed = entry.header.compressedSize ?? 1;
    if (compressed > 0 && expanded / compressed > MAX_RATIO) {
      return { ok: false, error: 'Archive entry has suspicious compression ratio' };
    }
  }

  if (!hasRootSkillMd) {
    return { ok: false, error: 'Archive must contain SKILL.md at its root' };
  }

  return { ok: true };
}
