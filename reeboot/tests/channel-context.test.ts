/**
 * Tests for channel context header injection into agent prompts.
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { Orchestrator } from '../src/orchestrator.js';
import { MessageBus, createIncomingMessage } from '../src/channels/interface.js';
import type { AgentRunner, RunnerEvent } from '../src/agent-runner/interface.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCaptureRunner(): { runner: AgentRunner; captured: string[] } {
  const captured: string[] = [];
  const runner: AgentRunner = {
    async prompt(content: string, onEvent: (e: RunnerEvent) => void) {
      captured.push(content);
      onEvent({ type: 'message_end', runId: 'r1', usage: { input: 0, output: 0 } });
    },
    abort() {},
    async dispose() {},
    async reload() {},
  };
  return { runner, captured };
}

function makeOrchestrator(runner: AgentRunner) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE IF NOT EXISTS contexts (id TEXT PRIMARY KEY, name TEXT NOT NULL, model_provider TEXT NOT NULL DEFAULT '', model_id TEXT NOT NULL DEFAULT '')`);
  db.prepare(`INSERT OR IGNORE INTO contexts (id, name) VALUES ('main', 'main')`).run();
  db.exec(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY DEFAULT (hex(randomblob(8))),
    context_id TEXT NOT NULL, channel TEXT NOT NULL DEFAULT '',
    peer_id TEXT NOT NULL DEFAULT '', role TEXT NOT NULL,
    content TEXT NOT NULL, tokens_used INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS turn_journal (turn_id TEXT PRIMARY KEY, context_id TEXT NOT NULL, session_path TEXT, prompt TEXT, started_at TEXT NOT NULL DEFAULT (datetime('now')), status TEXT NOT NULL DEFAULT 'open')`);
  db.exec(`CREATE TABLE IF NOT EXISTS turn_journal_steps (id INTEGER PRIMARY KEY AUTOINCREMENT, turn_id TEXT NOT NULL, seq INTEGER NOT NULL, tool_name TEXT NOT NULL, tool_input TEXT NOT NULL, tool_output TEXT, is_error INTEGER NOT NULL DEFAULT 0, fired_at TEXT NOT NULL DEFAULT (datetime('now')))`);

  const bus = new MessageBus();
  const adapters = new Map<string, any>();
  adapters.set('whatsapp', { async send() {}, status: () => 'connected', connectedAt: () => null });
  adapters.set('scheduler', { async send() {}, status: () => 'connected', connectedAt: () => null });

  const runners = new Map<string, AgentRunner>();
  runners.set('main', runner);

  const config = { routing: { default: 'main', rules: [] }, agent: { turnTimeout: 5000 } };
  const orch = new Orchestrator(config as any, bus, adapters, runners, db);
  orch.start();
  return { orch, bus };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Channel context header injection', () => {
  it('prepends [channel: X | peer: Y] header for whatsapp messages', async () => {
    const { runner, captured } = makeCaptureRunner();
    const { bus } = makeOrchestrator(runner);

    bus.publish(createIncomingMessage({
      channelType: 'whatsapp',
      peerId: '+40712345678',
      content: 'hi there',
      raw: null,
    }));

    await new Promise(r => setTimeout(r, 100));

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatch(/^\[channel: whatsapp \| peer: \+40712345678\]/);
    expect(captured[0]).toContain('hi there');
  });

  it('prepends header for web channel messages', async () => {
    const { runner, captured } = makeCaptureRunner();
    const { bus } = makeOrchestrator(runner);

    bus.publish(createIncomingMessage({
      channelType: 'web',
      peerId: 'session-abc',
      content: 'hello',
      raw: null,
    }));

    await new Promise(r => setTimeout(r, 100));

    expect(captured[0]).toMatch(/^\[channel: web \| peer: session-abc\]/);
  });

  it('does NOT prepend header for scheduler turns', async () => {
    const { runner, captured } = makeCaptureRunner();
    const { bus } = makeOrchestrator(runner);

    bus.publish(createIncomingMessage({
      channelType: 'scheduler',
      peerId: 'scheduler',
      content: 'run daily task',
      raw: null,
    }));

    await new Promise(r => setTimeout(r, 100));

    expect(captured[0]).not.toMatch(/^\[channel:/);
    expect(captured[0]).toBe('run daily task');
  });

  it('does NOT prepend header for recovery turns', async () => {
    const { runner, captured } = makeCaptureRunner();
    const { bus } = makeOrchestrator(runner);

    bus.publish(createIncomingMessage({
      channelType: 'recovery',
      peerId: 'main',
      content: 'recovered prompt',
      raw: null,
    }));

    await new Promise(r => setTimeout(r, 100));

    expect(captured[0]).not.toMatch(/^\[channel:/);
    expect(captured[0]).toBe('recovered prompt');
  });
});
