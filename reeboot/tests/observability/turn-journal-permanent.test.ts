import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runResilienceMigration, runObservabilityMigration } from '@src/db/schema.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runResilienceMigration(db);
  runObservabilityMigration(db); // adds closed_at column
  return db;
}

describe('Turn journal — permanent record', () => {
  it('closeTurn sets status=closed and closed_at, does NOT delete the row', async () => {
    const { TurnJournal } = await import('@src/resilience/turn-journal.js');
    const db = makeDb();
    const journal = new TurnJournal(db);

    journal.openTurn('t1', 'ctx1', 'hello');
    journal.closeTurn('t1');

    const row = db.prepare('SELECT * FROM turn_journal WHERE turn_id = ?').get('t1') as any;
    expect(row).toBeDefined();
    expect(row.status).toBe('closed');
    expect(row.closed_at).toBeTruthy();
  });

  it('closeTurn does NOT delete turn_journal_steps', async () => {
    const { TurnJournal } = await import('@src/resilience/turn-journal.js');
    const db = makeDb();
    const journal = new TurnJournal(db);

    journal.openTurn('t1', 'ctx1', 'hello');
    journal.appendStep('t1', { seq: 1, toolName: 'search', toolInput: '{}', toolOutput: 'r', isError: false });
    journal.closeTurn('t1');

    const steps = db.prepare('SELECT * FROM turn_journal_steps WHERE turn_id = ?').all('t1');
    expect(steps).toHaveLength(1);
  });

  it('getOpenJournals does NOT return closed turns', async () => {
    const { TurnJournal, getOpenJournals } = await import('@src/resilience/turn-journal.js');
    const db = makeDb();
    const journal = new TurnJournal(db);

    journal.openTurn('t1', 'ctx1', 'prompt1');
    journal.openTurn('t2', 'ctx2', 'prompt2');
    journal.closeTurn('t1');

    const open = getOpenJournals(db);
    expect(open.map((j) => j.turn_id)).not.toContain('t1');
    expect(open.map((j) => j.turn_id)).toContain('t2');
  });

  it('getClosedTurns returns closed turns ordered by closed_at DESC', async () => {
    const { TurnJournal, getClosedTurns } = await import('@src/resilience/turn-journal.js');
    const db = makeDb();
    const journal = new TurnJournal(db);

    journal.openTurn('t1', 'ctx1', 'p1');
    journal.openTurn('t2', 'ctx1', 'p2');
    journal.closeTurn('t1');
    journal.closeTurn('t2');

    // Force different timestamps so ordering is deterministic
    db.prepare(`UPDATE turn_journal SET closed_at = '2024-01-01T10:00:00' WHERE turn_id = 't1'`).run();
    db.prepare(`UPDATE turn_journal SET closed_at = '2024-01-01T11:00:00' WHERE turn_id = 't2'`).run();

    const closed = getClosedTurns(db, { limit: 10 });
    expect(closed.length).toBe(2);
    // Most recently closed first
    const ids = closed.map((j) => j.turn_id);
    expect(ids[0]).toBe('t2');
  });

  it('pruneTurns deletes old closed rows but not recent ones', async () => {
    const { TurnJournal, pruneTurns } = await import('@src/resilience/turn-journal.js');
    const db = makeDb();
    const journal = new TurnJournal(db);

    journal.openTurn('old', 'ctx1', 'old prompt');
    journal.openTurn('new', 'ctx1', 'new prompt');
    journal.closeTurn('old');
    journal.closeTurn('new');

    // Artificially age the 'old' row to 31 days ago
    db.prepare(
      `UPDATE turn_journal SET closed_at = datetime('now', '-31 days') WHERE turn_id = 'old'`
    ).run();

    pruneTurns(db, 30);

    const old = db.prepare('SELECT * FROM turn_journal WHERE turn_id = ?').get('old');
    const recent = db.prepare('SELECT * FROM turn_journal WHERE turn_id = ?').get('new');
    expect(old).toBeUndefined();
    expect(recent).toBeDefined();
  });

  it('pruneTurns never deletes open rows', async () => {
    const { TurnJournal, pruneTurns } = await import('@src/resilience/turn-journal.js');
    const db = makeDb();
    const journal = new TurnJournal(db);

    journal.openTurn('open', 'ctx1', 'in progress');
    // Age the started_at but leave status = 'open'
    db.prepare(
      `UPDATE turn_journal SET started_at = datetime('now', '-60 days') WHERE turn_id = 'open'`
    ).run();

    pruneTurns(db, 30);

    const row = db.prepare('SELECT * FROM turn_journal WHERE turn_id = ?').get('open');
    expect(row).toBeDefined();
  });
});
