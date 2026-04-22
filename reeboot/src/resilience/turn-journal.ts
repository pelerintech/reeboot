import type { Database } from 'better-sqlite3';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TurnJournalStep {
  seq: number;
  toolName: string;
  toolInput: string;
  toolOutput?: string;
  isError: boolean;
}

export interface OpenJournal {
  turn_id: string;
  context_id: string;
  session_path: string | null;
  prompt: string | null;
  started_at: string;
  status: string;
  steps: Array<{
    id: number;
    turn_id: string;
    seq: number;
    tool_name: string;
    tool_input: string;
    tool_output: string | null;
    is_error: number;
    fired_at: string;
  }>;
}

// ─── TurnJournal ──────────────────────────────────────────────────────────────

/**
 * Manages the ephemeral turn journal in SQLite.
 *
 * Each agent turn opens a journal row at start. Tool call completions are
 * appended as steps. On successful turn completion, the row is deleted.
 * An open row on startup signals a crashed turn.
 */
export class TurnJournal {
  private _db: Database;

  constructor(db: Database) {
    this._db = db;
  }

  openTurn(
    turnId: string,
    contextId: string,
    prompt: string,
    sessionPath?: string
  ): void {
    this._db
      .prepare(
        `INSERT INTO turn_journal (turn_id, context_id, prompt, session_path)
         VALUES (?, ?, ?, ?)`
      )
      .run(turnId, contextId, prompt, sessionPath ?? null);
  }

  appendStep(turnId: string, step: TurnJournalStep): void {
    this._db
      .prepare(
        `INSERT INTO turn_journal_steps (turn_id, seq, tool_name, tool_input, tool_output, is_error)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        turnId,
        step.seq,
        step.toolName,
        step.toolInput,
        step.toolOutput ?? null,
        step.isError ? 1 : 0
      );
  }

  /** Deletes the journal row and cascades to steps on successful turn completion. */
  closeTurn(turnId: string): void {
    this._db
      .prepare('DELETE FROM turn_journal WHERE turn_id = ?')
      .run(turnId);
  }
}

// ─── getOpenJournals ──────────────────────────────────────────────────────────

/**
 * Returns all open turn_journal rows joined with their steps.
 * An open journal row is crash evidence.
 */
export function getOpenJournals(db: Database): OpenJournal[] {
  const journals = db
    .prepare(`SELECT * FROM turn_journal WHERE status = 'open'`)
    .all() as Omit<OpenJournal, 'steps'>[];

  return journals.map((j) => {
    const steps = db
      .prepare(`SELECT * FROM turn_journal_steps WHERE turn_id = ? ORDER BY seq ASC`)
      .all(j.turn_id) as OpenJournal['steps'];
    return { ...j, steps };
  });
}
