# Design — hot memory

## Context

The agent's working conversation context (pi `AgentSession`) is destroyed by `runner.reset()` when the inactivity timer fires (4h default). The conversation content persists in the `messages` SQLite table and session `.jsonl` files, but nothing bridges the gap between sessions.

Existing mechanisms that partially address this:

| Mechanism | What it does | Gap |
|---|---|---|
| `session_search` | FTS5 full-text search over `messages` table | Agent doesn't know it exists or when to use it |
| MEMORY.md/USER.md | Persistent facts injected into every session | Holds explicit facts, not session context. Daily consolidation schedule |
| Daily consolidation | Mines messages → writes to MEMORY.md | Runs at 2am, not at session boundaries. Updates MEMORY.md, not session awareness |
| pi session compaction | Summarizes old messages within a session | Summary locked inside the `.jsonl` file — dies with the session |

## Approach

A **hot-memory extension** that operates at session boundaries using existing pi lifecycle hooks.

```
                         runner.reset()
                              │
                              ▼
 ┌─────────────────────────────────────────┐
 │  session_shutdown (reason: 'new')       │
 │                                         │
 │  → Read last session's messages from DB │
 │  → LLM distills into 2-3 line summary   │
 │  → Write to hot-memory file             │
 │  → Prune entries >6 or >3 days old      │
 └─────────────────────────────────────────┘
                              │
                    (time passes)
                              │
                              ▼
 ┌─────────────────────────────────────────┐
 │  before_agent_start                     │
 │                                         │
 │  → Read hot-memory file                 │
 │  → Inject into system prompt            │
 │  → Includes retrieval instructions      │
 └─────────────────────────────────────────┘

 Next user message → Agent sees hot memory → 
   If user references past → check hot memory → session_search → answer
   If no match → ask user → broader session_search
```

### Hot memory storage

A single markdown file: `~/.reeboot/hot-memory.md`

Format:
```markdown
# HOT MEMORY — Recent Sessions

## 2026-07-22 10:00 — Research on quantum computing
Summary: Explored quantum annealing vs gate-based models. User interested in practical applications.
Conclusions: Gate-based more flexible but noisier. User wanted to revisit next session.

## 2026-07-21 15:30 — Project planning
Summary: Reviewed hot-memory design. Decisions made on file format and LLM trigger.
Conclusions: Ready to implement. Next step: write the extension.
```

Each session gets: date, title (auto-generated from topic), brief summary (2–3 lines), key conclusions.

Rolling window: keep the last 6 sessions or entries younger than 3 days, whichever produces more. Prune on every write cycle.

### Distillation trigger

Hook: `session_shutdown` with `reason === 'new'` (the reason fired by `runner.reset()`).

The extension:
1. Gets the DB handle via `getDb()` (same pattern as `memory-manager.ts`)
2. Queries `messages` table for messages since the last hot-memory entry timestamp, scoped to the context
3. If no new messages since last entry, skip (avoid empty summaries)
4. Calls the LLM using the agent's **own configured model** (from `config.agent.model.provider` + `config.agent.model.id`) — never a hardcoded model name
5. Appends the formatted summary to `hot-memory.md`
6. Prunes old entries

The LLM call is a simple text-in/text-out completion using the same provider/auth the agent already uses. The prompt: "Generate 2-3 lines summarizing this conversation. Include the main topic, key conclusions, and any open threads. Be brief."

The extension receives the full app config at registration time (same pattern as `makeMemoryExtension(pi, config)`). It reads `config.agent.model` to determine provider, model ID, and resolves the API key from the same env var the runner uses (`resolveProviderEnvKey`). The LLM call is a direct HTTP request to the provider's chat completions endpoint — no pi SDK dependency, no hardcoded model resolution.

### Injection into system prompt

Hook: `before_agent_start`.

The extension:
1. Reads `hot-memory.md`
2. If non-empty, appends a block to the system prompt:

```
[HOT MEMORY — your recent conversations]
Below are brief summaries of your last few sessions.
If the user references a past conversation:
  1. Check this hot memory for a matching topic
  2. If found, call session_search with relevant terms to get full context
  3. Respond with the actual details from the past session
  4. If no match in hot memory, ask the user if it was from more than a few sessions ago
     and do a broader session_search

<hot memory content>
[END HOT MEMORY]
```

If hot memory is empty (first ever session, or all entries pruned), no block is injected.

### Rolling window management

On every write:
1. Parse current entries from the file (each `## date — title` block)
2. Add the new entry to the front
3. Remove entries where session date is older than 3 days, unless that would leave fewer than 4 entries
4. If still more than 6 entries, keep the 6 most recent
5. Write the result

This guarantees: minimum 4 entries (even if old), maximum 6 entries, all within ~3 days.

### Relationship to existing systems

| System | How it relates |
|---|---|
| MEMORY.md / consolidation | Unchanged. Consolidation continues mining messages for persistent facts at 2am. Hot memory is separate — session summaries, not persistent facts |
| `session_search` | Hot memory drives the *decision* to search; `session_search` provides the *mechanism* |
| `memory` tool | Unchanged. Agent can still write explicit facts to MEMORY.md |
| pi session compaction | Unchanged. Still runs within a session. Hot memory bridges *between* sessions |
| Session file persistence | Unchanged. `.jsonl` files still saved; hot memory adds awareness layer above them |

### Model used for distillation

Hot memory uses the **same model the agent is already configured with** — read from `config.agent.model.provider` and `config.agent.model.id` at extension registration time. No separate model config, no hardcoded model name.

The extension resolves the API key from the same env vars the runner uses (e.g. `ANTHROPIC_API_KEY` for Anthropic, `OPENAI_API_KEY` for OpenAI) via `resolveProviderEnvKey`. It makes a direct HTTP request to the provider's chat completions endpoint — no pi SDK dependency, no model registry lookup, no hardcoded fallbacks.

This avoids the bug pattern in `custom-compaction.ts` which silently fails when a hardcoded model (Gemini Flash) is unavailable.

## Risks

| Risk | Mitigation |
|---|---|
| LLM distillation adds latency at session close | Session close is asynchronous (background, no user waiting). Extension fires on `session_shutdown` event, doesn't block the reset |
| Distillation uses the same model as the agent — could be expensive/overkill for tiny summaries | Token cost is minimal (2-3 line summary, single short prompt). If cost becomes a concern, a lightweight model preference can be added later as a config option — never hardcoded |
| LLM distillation costs | Each summary is 2-3 lines per session. ~4-6 sessions/day worst case = negligible token cost |
| Hot memory leaks sensitive info across contexts | Hot memory is instance-level (same as MEMORY.md). PI mode: single owner, acceptable. REE mode: hot memory is per-chat (handled by ree-specific extension or gated) |
| LLM generates inaccurate summaries | Summaries are awareness triggers, not authoritative records. The actual content always comes from `session_search` (the source of truth). An inaccurate summary just means a wrong trigger — the user corrects, agent searches again |
| File contention on hot-memory.md | Only touched by extension hooks (session_shutdown = single process, before_agent_start = single process). No concurrent writes |
