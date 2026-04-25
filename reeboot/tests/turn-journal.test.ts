import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

describe('TurnJournal', () => {
  let db: InstanceType<typeof Database>;

  beforeEach(async () => {
    const { runResilienceMigration } = await import('@src/db/schema.js');
    db = new Database(':memory:');
    db.exec(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, context_id TEXT NOT NULL, schedule TEXT NOT NULL, prompt TEXT NOT NULL)`);
    runResilienceMigration(db);
  });

  it('openTurn inserts a row with status=open', async () => {
    const { TurnJournal } = await import('@src/resilience/turn-journal.js');
    const journal = new TurnJournal(db);
    journal.openTurn('turn1', 'ctx1', 'hello world');
    const row = db.prepare('SELECT * FROM turn_journal WHERE turn_id = ?').get('turn1') as any;
    expect(row).toBeTruthy();
    expect(row.status).toBe('open');
    expect(row.context_id).toBe('ctx1');
    expect(row.prompt).toBe('hello world');
  });

  it('appendStep inserts a row in turn_journal_steps', async () => {
    const { TurnJournal } = await import('@src/resilience/turn-journal.js');
    const journal = new TurnJournal(db);
    journal.openTurn('turn1', 'ctx1', 'hello');
    journal.appendStep('turn1', {
      seq: 1,
      toolName: 'web_search',
      toolInput: '{"query":"test"}',
      toolOutput: 'result',
      isError: false,
    });
    const step = db.prepare('SELECT * FROM turn_journal_steps WHERE turn_id = ?').get('turn1') as any;
    expect(step).toBeTruthy();
    expect(step.tool_name).toBe('web_search');
    expect(step.tool_input).toBe('{"query":"test"}');
    expect(step.tool_output).toBe('result');
    expect(step.is_error).toBe(0);
    expect(step.seq).toBe(1);
  });

  it('closeTurn deletes the journal row and cascades steps', async () => {
    const { TurnJournal } = await import('@src/resilience/turn-journal.js');
    db.pragma('foreign_keys = ON');
    const journal = new TurnJournal(db);
    journal.openTurn('turn1', 'ctx1', 'hello');
    journal.appendStep('turn1', { seq: 1, toolName: 'search', toolInput: '{}', toolOutput: 'r', isError: false });
    journal.closeTurn('turn1');
    const row = db.prepare('SELECT * FROM turn_journal WHERE turn_id = ?').get('turn1');
    expect(row).toBeUndefined();
    const steps = db.prepare('SELECT * FROM turn_journal_steps WHERE turn_id = ?').all('turn1');
    expect(steps).toHaveLength(0);
  });

  it('getOpenJournals returns open journals with their steps', async () => {
    const { TurnJournal, getOpenJournals } = await import('@src/resilience/turn-journal.js');
    const journal = new TurnJournal(db);
    journal.openTurn('t1', 'ctx1', 'prompt1');
    journal.appendStep('t1', { seq: 1, toolName: 'tool_a', toolInput: '{}', toolOutput: 'out', isError: false });
    journal.openTurn('t2', 'ctx2', 'prompt2');
    // t2 has no steps

    const open = getOpenJournals(db);
    expect(open).toHaveLength(2);
    const t1 = open.find(j => j.turn_id === 't1')!;
    expect(t1.steps).toHaveLength(1);
    expect(t1.steps[0].tool_name).toBe('tool_a');
    const t2 = open.find(j => j.turn_id === 't2')!;
    expect(t2.steps).toHaveLength(0);
  });
});
