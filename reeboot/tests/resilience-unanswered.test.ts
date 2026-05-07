import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ─── helpers ─────────────────────────────────────────────────────────────────

function userEntry(text: string) {
  return JSON.stringify({
    type: 'message',
    message: { role: 'user', content: [{ type: 'text', text }] },
  });
}

function assistantEntry(text = 'OK') {
  return JSON.stringify({
    type: 'message',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  });
}

function sessionEntry() {
  return JSON.stringify({ type: 'session', version: 3, cwd: '/tmp' });
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `reeboot-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeSession(filename: string, lines: string[]): string {
  const path = join(tmpDir, filename);
  writeFileSync(path, lines.join('\n') + '\n', 'utf8');
  return path;
}

// ─── scanSessionForUnansweredMessage ─────────────────────────────────────────

describe('scanSessionForUnansweredMessage', () => {
  it('returns the user text when the last message entry is from the user', async () => {
    const { scanSessionForUnansweredMessage } = await import('@src/resilience/startup.js');
    const path = writeSession('unanswered.json', [
      sessionEntry(),
      assistantEntry('Hello!'),
      userEntry('what is the weather?'),
    ]);
    const result = scanSessionForUnansweredMessage(path);
    expect(result).toBe('what is the weather?');
  });

  it('returns null when the last message entry is from the assistant', async () => {
    const { scanSessionForUnansweredMessage } = await import('@src/resilience/startup.js');
    const path = writeSession('answered.json', [
      sessionEntry(),
      userEntry('ping'),
      assistantEntry('pong'),
    ]);
    const result = scanSessionForUnansweredMessage(path);
    expect(result).toBeNull();
  });

  it('returns null when there are no message entries at all', async () => {
    const { scanSessionForUnansweredMessage } = await import('@src/resilience/startup.js');
    const path = writeSession('empty.json', [sessionEntry()]);
    const result = scanSessionForUnansweredMessage(path);
    expect(result).toBeNull();
  });

  it('returns null for a non-existent file', async () => {
    const { scanSessionForUnansweredMessage } = await import('@src/resilience/startup.js');
    const result = scanSessionForUnansweredMessage('/no/such/file.json');
    expect(result).toBeNull();
  });

  it('ignores non-message entries that appear after the last assistant message', async () => {
    const { scanSessionForUnansweredMessage } = await import('@src/resilience/startup.js');
    // session header after messages (unusual but valid)
    const path = writeSession('with-compaction.json', [
      sessionEntry(),
      userEntry('hello'),
      assistantEntry('hi'),
      JSON.stringify({ type: 'compaction', summary: 'compacted', tokensBefore: 1000 }),
    ]);
    // last *message* entry is assistant — should return null
    const result = scanSessionForUnansweredMessage(path);
    expect(result).toBeNull();
  });

  it('handles multi-part user content — returns first text block', async () => {
    const { scanSessionForUnansweredMessage } = await import('@src/resilience/startup.js');
    const path = writeSession('multi-part.json', [
      sessionEntry(),
      JSON.stringify({
        type: 'message',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'first part' },
            { type: 'text', text: ' second part' },
          ],
        },
      }),
    ]);
    const result = scanSessionForUnansweredMessage(path);
    expect(result).toBe('first part second part');
  });
});
