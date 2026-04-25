/**
 * Tests for session resume file filter and unanswered message detection.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, utimesSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { getResumedSessionPath } from '../src/context.js';
import { scanSessionForUnansweredMessage } from '../src/resilience/startup.js';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `reeboot-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeSessionsDir(base: string, contextId = 'main'): string {
  const dir = join(base, 'sessions', contextId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Write a file and optionally set its mtime to a specific age
function writeSessionFile(dir: string, name: string, ageMs = 0): string {
  const path = join(dir, name);
  writeFileSync(path, '{"type":"session"}\n');
  if (ageMs > 0) {
    const t = new Date(Date.now() - ageMs);
    utimesSync(path, t, t);
  }
  return path;
}

const INACTIVITY_MS = 4 * 60 * 60 * 1000; // 4 hours

// ─── pi JSONL session helpers ─────────────────────────────────────────────────

function makeSessionLine(role: string, text: string): string {
  return JSON.stringify({
    type: 'message',
    message: {
      role,
      content: [{ type: 'text', text }],
    },
  });
}

function writeSessionWithLines(dir: string, name: string, lines: string[]): string {
  const path = join(dir, name);
  writeFileSync(path, lines.join('\n') + '\n');
  return path;
}

describe('getResumedSessionPath', () => {
  let tmpBase: string;
  let sessionsDir: string;

  beforeEach(() => {
    tmpBase = makeTmpDir();
    sessionsDir = makeSessionsDir(tmpBase);
  });

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it('returns path to most recent .jsonl file within inactivity window', () => {
    // older file — 30 minutes ago
    writeSessionFile(sessionsDir, '2026-04-23T10-00-00-000Z_aaa.jsonl', 30 * 60 * 1000);
    // newer file — 5 minutes ago
    const newer = writeSessionFile(sessionsDir, '2026-04-23T10-30-00-000Z_bbb.jsonl', 5 * 60 * 1000);

    const result = getResumedSessionPath('main', INACTIVITY_MS, tmpBase);
    expect(result).toBe(newer);
  });

  it('returns null when most recent .jsonl file is outside inactivity window', () => {
    // 5 hours ago — outside 4h window
    writeSessionFile(sessionsDir, '2026-04-23T05-00-00-000Z_aaa.jsonl', 5 * 60 * 60 * 1000);

    const result = getResumedSessionPath('main', INACTIVITY_MS, tmpBase);
    expect(result).toBeNull();
  });

  it('returns null when sessions dir is empty', () => {
    const result = getResumedSessionPath('main', INACTIVITY_MS, tmpBase);
    expect(result).toBeNull();
  });

  it('returns null when only old-format session-*.json files exist', () => {
    writeSessionFile(sessionsDir, 'session-1234567890-abc.json', 5 * 60 * 1000);

    const result = getResumedSessionPath('main', INACTIVITY_MS, tmpBase);
    expect(result).toBeNull();
  });

  it('picks the lexicographically latest .jsonl file', () => {
    writeSessionFile(sessionsDir, '2026-04-23T08-00-00-000Z_aaa.jsonl', 60 * 1000);
    writeSessionFile(sessionsDir, '2026-04-23T09-00-00-000Z_bbb.jsonl', 60 * 1000);
    const latest = writeSessionFile(sessionsDir, '2026-04-23T10-00-00-000Z_ccc.jsonl', 60 * 1000);

    const result = getResumedSessionPath('main', INACTIVITY_MS, tmpBase);
    expect(result).toBe(latest);
  });

  it('ignores old-format session-*.json files even when within window', () => {
    // old format within window — should be ignored
    writeSessionFile(sessionsDir, 'session-123.json', 5 * 60 * 1000);
    // no jsonl files

    const result = getResumedSessionPath('main', INACTIVITY_MS, tmpBase);
    expect(result).toBeNull();
  });
});

describe('scanSessionForUnansweredMessage', () => {
  let tmpBase: string;
  let sessionsDir: string;

  beforeEach(() => {
    tmpBase = makeTmpDir();
    sessionsDir = makeSessionsDir(tmpBase);
  });

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it('returns user message text when last message is from user with no assistant reply', () => {
    const path = writeSessionWithLines(sessionsDir, 'session.jsonl', [
      '{"type":"session","id":"abc"}',
      makeSessionLine('user', 'hello there'),
    ]);

    const result = scanSessionForUnansweredMessage(path);
    expect(result).toBe('hello there');
  });

  it('returns null when last message is from the assistant', () => {
    const path = writeSessionWithLines(sessionsDir, 'session.jsonl', [
      makeSessionLine('user', 'hello'),
      makeSessionLine('assistant', 'hi there, how can I help?'),
    ]);

    const result = scanSessionForUnansweredMessage(path);
    expect(result).toBeNull();
  });

  it('returns null for empty file', () => {
    const path = join(sessionsDir, 'empty.jsonl');
    writeFileSync(path, '');
    const result = scanSessionForUnansweredMessage(path);
    expect(result).toBeNull();
  });

  it('returns null for non-existent file', () => {
    const result = scanSessionForUnansweredMessage('/nonexistent/path.jsonl');
    expect(result).toBeNull();
  });

  it('handles malformed lines gracefully and still finds last valid message', () => {
    const path = writeSessionWithLines(sessionsDir, 'session.jsonl', [
      makeSessionLine('user', 'my question'),
      'not valid json{{{{',
      '{"type":"other_event"}',
    ]);

    // Last message entry is the user message — non-message lines are skipped
    const result = scanSessionForUnansweredMessage(path);
    expect(result).toBe('my question');
  });
});
