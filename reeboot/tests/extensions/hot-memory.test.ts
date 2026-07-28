import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// These will be imported after the implementation exists
// For now, define expected function signatures
let initHotMemoryFile: (dir: string) => void;
let readHotMemoryFile: (dir: string) => string;
let formatHotMemoryEntry: (entry: any) => string;
let parseHotMemoryFile: (content: string) => any[];
let pruneEntries: (entries: any[], maxEntries?: number, maxDays?: number) => any[];
let buildHotMemoryBlock: (content: string) => string;
let HOT_MEMORY_HEADER: string;

beforeEach(async () => {
  try {
    const mod = await import('../../src/extensions/hot-memory.js');
    initHotMemoryFile = mod.initHotMemoryFile;
    readHotMemoryFile = mod.readHotMemoryFile;
    formatHotMemoryEntry = mod.formatHotMemoryEntry;
    parseHotMemoryFile = mod.parseHotMemoryFile;
    pruneEntries = mod.pruneEntries;
    buildHotMemoryBlock = mod.buildHotMemoryBlock;
    HOT_MEMORY_HEADER = mod.HOT_MEMORY_HEADER;
  } catch {
    // Module doesn't exist yet — tests will fail as expected
  }
});

// ─── Tmp dir helpers ──────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `hot-memory-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
});

afterEach(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── initHotMemoryFile ───────────────────────────────────────────────────────

describe('initHotMemoryFile', () => {
  it('creates hot-memory.md with header when directory does not exist', () => {
    expect(existsSync(tmpDir)).toBe(false);
    initHotMemoryFile(tmpDir);
    const filePath = join(tmpDir, 'hot-memory.md');
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toBe(HOT_MEMORY_HEADER);
  });

  it('does NOT overwrite existing file when called again', () => {
    initHotMemoryFile(tmpDir);
    const filePath = join(tmpDir, 'hot-memory.md');
    writeFileSync(filePath, 'custom content', 'utf-8');
    initHotMemoryFile(tmpDir);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toBe('custom content');
  });

  it('works when directory already exists but file is absent', () => {
    mkdirSync(tmpDir, { recursive: true });
    initHotMemoryFile(tmpDir);
    const filePath = join(tmpDir, 'hot-memory.md');
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toBe(HOT_MEMORY_HEADER);
  });
});

// ─── readHotMemoryFile ───────────────────────────────────────────────────────

describe('readHotMemoryFile', () => {
  it('returns empty string when file does not exist', () => {
    const content = readHotMemoryFile(tmpDir);
    expect(content).toBe('');
  });

  it('returns file content when file exists', () => {
    initHotMemoryFile(tmpDir);
    const content = readHotMemoryFile(tmpDir);
    expect(content).toBe(HOT_MEMORY_HEADER);
  });
});

// ─── formatHotMemoryEntry ─────────────────────────────────────────────────────

describe('formatHotMemoryEntry', () => {
  it('formats an entry with date, title, summary, conclusions', () => {
    const entry = {
      date: '2026-07-22 10:00',
      title: 'Research on quantum computing',
      summary: 'Explored quantum annealing vs gate-based models. User interested in practical applications.',
      conclusions: 'Gate-based more flexible but noisier.',
    };
    const result = formatHotMemoryEntry(entry);
    expect(result).toContain('2026-07-22 10:00');
    expect(result).toContain('Research on quantum computing');
    expect(result).toContain('quantum annealing');
    expect(result).toContain('Gate-based more flexible');
    expect(result).toContain('## ');
  });

  it('formats an entry without conclusions', () => {
    const entry = {
      date: '2026-07-22 10:00',
      title: 'Quick chat',
      summary: 'A brief conversation.',
    };
    const result = formatHotMemoryEntry(entry);
    expect(result).toContain('Quick chat');
    expect(result).toContain('A brief conversation.');
  });
});

// ─── parseHotMemoryFile ───────────────────────────────────────────────────────

describe('parseHotMemoryFile', () => {
  it('parses entries from formatted content', () => {
    const content = [
      HOT_MEMORY_HEADER,
      '## 2026-07-22 10:00 — Research on quantum computing',
      'Summary: Explored quantum annealing. User interested in practical applications.',
      'Conclusions: Gate-based is more flexible.',
      '',
      '## 2026-07-21 15:30 — Project planning',
      'Summary: Reviewed hot-memory design.',
      'Conclusions: Ready to implement.',
      '',
    ].join('\n');

    const entries = parseHotMemoryFile(content);
    expect(entries).toHaveLength(2);
    expect(entries[0].date).toBe('2026-07-22 10:00');
    expect(entries[0].title).toBe('Research on quantum computing');
    expect(entries[0].summary).toContain('quantum annealing');
    expect(entries[0].conclusions).toContain('Gate-based');
    expect(entries[1].date).toBe('2026-07-21 15:30');
    expect(entries[1].title).toBe('Project planning');
  });

  it('returns empty array for header-only content', () => {
    const entries = parseHotMemoryFile(HOT_MEMORY_HEADER);
    expect(entries).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    const entries = parseHotMemoryFile('');
    expect(entries).toEqual([]);
  });

  it('handles entries without conclusions field', () => {
    const content = [
      HOT_MEMORY_HEADER,
      '## 2026-07-22 10:00 — Quick chat',
      'Summary: Just a quick hello.',
      '',
    ].join('\n');

    const entries = parseHotMemoryFile(content);
    expect(entries).toHaveLength(1);
    expect(entries[0].conclusions).toBeUndefined();
  });
});

// ─── pruneEntries ────────────────────────────────────────────────────────────

describe('pruneEntries', () => {
  function makeEntry(hoursAgo: number, title: string): any {
    const d = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 16).replace('T', ' ');
    return { date: dateStr, title, summary: `Summary of ${title}` };
  }

  it('keeps maxEntries most recent when all entries are within the age window', () => {
    // 8 entries all within 2 days (within 3-day maxDays window)
    const entries = Array.from({ length: 8 }, (_, i) => makeEntry(i * 0.25, `Session ${i + 1}`));
    const pruned = pruneEntries(entries, 6, 3);
    expect(pruned).toHaveLength(6);
    // Should keep the 6 most recent (lowest daysAgo = most recent)
    expect(pruned[0].title).toBe('Session 1');
    expect(pruned[5].title).toBe('Session 6');
  });

  it('prunes entries older than maxDays but keeps minimum 4', () => {
    // 6 entries: 4 recent (within 3 days = 72 hours), 2 old (240 hours = 10 days)
    const recent = Array.from({ length: 4 }, (_, i) => makeEntry(i * 10, `Recent ${i + 1}`));
    const old = Array.from({ length: 2 }, (_, i) => makeEntry(240 + i * 24, `Old ${i + 1}`));
    const entries = [...recent, ...old];
    const pruned = pruneEntries(entries, 6, 3);
    // 4 recent (within 72h) + 0 old (outside 72h) = 4
    expect(pruned).toHaveLength(4);
    expect(pruned.every((e: any) => e.title.startsWith('Recent'))).toBe(true);
  });

  it('keeps at least 4 entries even if all are old', () => {
    const entries = Array.from({ length: 4 }, (_, i) => makeEntry(240 + i * 24, `Old ${i + 1}`));
    const pruned = pruneEntries(entries, 6, 3);
    expect(pruned).toHaveLength(4);
  });

  it('keeps all entries when under max capacity', () => {
    const entries = Array.from({ length: 2 }, (_, i) => makeEntry(i * 10, `Session ${i + 1}`));
    const pruned = pruneEntries(entries, 6, 3);
    expect(pruned).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(pruneEntries([])).toEqual([]);
  });
});

// ─── buildHotMemoryBlock ──────────────────────────────────────────────────────

describe('buildHotMemoryBlock', () => {
  it('returns empty string for empty content (no file / first start)', () => {
    expect(buildHotMemoryBlock('')).toBe('');
    expect(buildHotMemoryBlock('  ')).toBe('');
  });

  it('returns a no-past-records awareness block when file exists but has no entries', () => {
    // Simulate hot memory file that has been init'd but has no sessions yet
    const headerContent = HOT_MEMORY_HEADER;
    const result = buildHotMemoryBlock(headerContent);
    // Should NOT return empty — agent needs to know it has no past records
    expect(result).not.toBe('');
    // Should indicate no past session records
    expect(result).toContain('no past session records');
    // Should NOT include session_search instructions (agent should not call it)
    expect(result).not.toContain('session_search');
    // Should mention no past records
    expect(result).toContain('no past session records');
    // Should be a lightweight awareness block, not a full hot memory block
    expect(result).not.toContain('[END HOT MEMORY]');
  });

  it('returns formatted block with content and instructions', () => {
    const content = [
      HOT_MEMORY_HEADER,
      '## 2026-07-22 10:00 — Research on quantum computing',
      'Summary: Explored quantum annealing.',
      '',
    ].join('\n');
    const result = buildHotMemoryBlock(content);
    expect(result).toContain('[HOT MEMORY]');
    expect(result).toContain('[END HOT MEMORY]');
    expect(result).toContain('quantum computing');
    expect(result).toContain('session_search');
  });

  it('includes retrieval instructions about checking hot memory then using session_search', () => {
    const content = [
      HOT_MEMORY_HEADER,
      '## 2026-07-22 10:00 — Test',
      'Summary: A session.',
      '',
    ].join('\n');
    const result = buildHotMemoryBlock(content);
    expect(result).toContain('Check this hot memory');
    expect(result).toContain('session_search');
    expect(result).toContain('no match');
  });
});
