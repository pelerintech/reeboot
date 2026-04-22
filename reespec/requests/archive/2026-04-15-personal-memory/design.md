# Design: Personal Memory

## Approach

A single new pi extension (`extensions/memory-manager.ts`) handles all memory concerns: system prompt injection, the `memory` tool, the `session_search` tool, and the observability log. A new scheduler task type handles background consolidation. Two new SQLite tables support FTS5 session search and observability logging. No new npm dependencies.

## Architecture

```
~/.reeboot/memories/
  MEMORY.md          ← agent's env/workflow notes (~2200 chars)
  USER.md            ← owner profile (~1375 chars)

reeboot.db (new tables)
  messages_fts       ← FTS5 virtual table on messages (session search)
  memory_log         ← auto-consolidation event log (observability)

extensions/
  memory-manager.ts  ← new extension (all memory concerns)

src/config.ts        ← memory config schema additions
src/db/schema.ts     ← FTS5 + memory_log table migrations
```

## Extension: memory-manager.ts

Registers on four pi lifecycle hooks:

**`before_agent_start`** — loads MEMORY.md and USER.md from disk, injects frozen snapshot block into system prompt. If `memory.enabled` is false, skips injection but still registers `session_search` tool.

**`resources_discover`** — no-op (memory files are not listed as resources, they are injected directly).

**`agent_end`** — no-op (memory writes happen via tool, not automatically after every turn).

**`session_shutdown`** — no-op.

Registers two tools:

**`memory` tool** (gated by `memory.enabled`):
- `add(target, content)` — appends new entry to MEMORY.md or USER.md
- `replace(target, old_text, content)` — substring-match replace on target file
- `remove(target, old_text)` — substring-match remove from target file
- Enforces character limits; returns error with current entries when full
- Rejects exact duplicates
- Scans for injection patterns before writing

**`session_search` tool** (always registered):
- `query(text, limit?)` — FTS5 full-text search over messages table
- Returns matching messages with context (role, created_at, content excerpt)
- Default limit: 10 results

## System prompt injection format

```
══════════════════════════════════════════════
MEMORY (your personal notes) [67% — 1,474/2,200 chars]
══════════════════════════════════════════════
User's project is a TypeScript monorepo at ~/code/myapi§
Owner prefers bullet points, dislikes verbose explanations§
Staging server requires SSH port 2222 — key at ~/.ssh/staging

══════════════════════════════════════════════
USER PROFILE [45% — 619/1,375 chars]
══════════════════════════════════════════════
Name: Alex, timezone: EST, role: backend engineer§
Prefers concise responses with code examples over prose
```

Injected as a static block in `before_agent_start` — frozen for the session lifetime. Changes written to disk during the session are visible from the next session.

## Consolidation scheduler task

A new built-in task type `consolidation` added to the scheduler. When triggered:

1. Reads all messages from `messages` table since last consolidation run (tracked in `memory_log`)
2. Builds a prompt with recent conversation excerpts + current MEMORY.md + USER.md content
3. Calls the agent's LLM with a consolidation prompt: "What new facts, preferences, corrections, or patterns should be added, updated, or removed from memory?"
4. Parses the LLM response into memory operations (add/replace/remove)
5. Applies operations respecting character limits (auto-consolidate if needed)
6. Writes a `memory_log` row: timestamp, sessions processed, operations applied, chars before/after

The consolidation task runs as a system-level scheduled task — not tied to any user context. It uses the same model as the default agent context.

## FTS5 schema

```sql
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content,
  role,
  created_at UNINDEXED,
  context_id UNINDEXED,
  content=messages,
  content_rowid=rowid
);
```

Populated via triggers on INSERT into `messages`. Existing messages backfilled on migration.

## memory_log schema

```sql
CREATE TABLE memory_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at      TEXT NOT NULL DEFAULT (datetime('now')),
  trigger     TEXT NOT NULL,  -- 'consolidation' | 'auto-capacity' | 'manual'
  sessions_processed INTEGER NOT NULL DEFAULT 0,
  ops_applied INTEGER NOT NULL DEFAULT 0,
  memory_chars_before INTEGER,
  memory_chars_after  INTEGER,
  user_chars_before   INTEGER,
  user_chars_after    INTEGER,
  notes       TEXT
);
```

## Config schema additions

```typescript
const MemoryConsolidationSchema = z.object({
  enabled: z.boolean().default(true),
  schedule: z.string().default('0 2 * * *'),
});

const MemoryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  memoryCharLimit: z.number().int().default(2200),
  userCharLimit: z.number().int().default(1375),
  consolidation: MemoryConsolidationSchema.default({}),
});
```

Memory is `enabled: true` by default. `session_search` works regardless.

## Capacity management

When `add` would exceed the character limit:
1. Return error listing current entries and capacity
2. Agent decides what to consolidate/remove to make room
3. Agent calls `replace` or `remove` first, then `add`

When consolidation process itself finds memory full:
1. LLM is given current entries + new insights
2. Asked to produce a consolidated version within the limit
3. Full replacement written as a single `replace` operation
4. `memory_log` row written with `trigger: 'auto-capacity'`

## Security

Before any write, content is checked for:
- Prompt injection patterns (`ignore previous instructions`, `system:`, etc.)
- Credential patterns (API keys, tokens, passwords)
- Invisible Unicode characters (zero-width spaces, etc.)

Content failing these checks is rejected with an error.

## Tradeoffs considered

**Why not store memory in SQLite instead of markdown files?**
Markdown files are human-readable, editable by the owner, portable (zip and share), and work naturally with the agent's file tools. SQLite storage would require custom read/write tooling and loses transparency. The character limit keeps the files small enough that there's no performance argument for a DB.

**Why frozen snapshot instead of live memory reads?**
Frozen at session start preserves the LLM's prefix cache — the system prompt doesn't change mid-session, which is critical for cost efficiency with Anthropic prompt caching. The tradeoff (changes visible next session, not immediately) is acceptable given that memory contains persistent facts, not session-ephemeral context.

**Why FTS5 instead of vector/semantic search for session_search?**
FTS5 requires zero new dependencies, is built into SQLite, and is sufficient for the primary use case: finding past conversations about a specific topic or containing a specific term. Semantic/vector search over sessions is deferred to a future iteration once sqlite-vec is introduced for domain knowledge (Loop 2).
