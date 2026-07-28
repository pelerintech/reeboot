## Evaluation — 2026-07-28 09:51

### distillation (hot-memory-1, 2, 3)
verdict:  ⚠️ PARTIAL
reason:   Spec ID hot-memory-1 says "writes the formatted entry (date, title, summary,
          conclusions) to `~/.reeboot/hot-memory.md`". The implementation writes to
          `~/.reeboot/memories/hot-memory.md` instead (src/extensions/hot-memory.ts:336
          — `join(homedir(), '.reeboot', 'memories')`). The distillation logic itself
          (query messages since last distill timestamp, call LLM, parse, write entry
          with date/title/summary/conclusions) is present and tested, and hot-memory-2
          (empty session → no write, no LLM call) and hot-memory-3 (LLM failure → no
          crash, no write) are both satisfied by tests/extensions/hot-memory-distill.test.ts.
focus:    src/extensions/hot-memory.ts:336 — file path deviates from spec contract

### injection (hot-memory-4, 5, 6)
verdict:  ⚠️ PARTIAL
reason:   Spec hot-memory-4 says the block must contain "a `[HOT MEMORY]` block" and
          "Instructions for using hot memory with session_search". The code builds a
          block labeled `[HOT MEMORY — your recent conversations]` with `[END HOT MEMORY]`
          markers and includes session_search instructions (src/extensions/hot-memory.ts:155
          INSTRUCTIONS constant) — functionally present but the block label differs from
          the literal `[HOT MEMORY]` in the spec. hot-memory-5 (empty → no injection) and
          hot-memory-6 (missing file → no crash, no injection) are both satisfied via
          `buildHotMemoryBlock` returning empty string for empty/missing content. Same
          path deviation as distillation applies (reads from `~/.reeboot/memories/` not
          `~/.reeboot/`).
focus:    src/extensions/hot-memory.ts:155-175 — block label naming; src/extensions/hot-memory.ts:336 — path

### retrieval (hot-memory-7, 8, 9)
verdict:  ⚠️ PARTIAL
reason:   hot-memory-7 (match found → call session_search, respond with details) and
          hot-memory-8 (no match → ask user, broader session_search) are covered by the
          injected INSTRUCTIONS constant in src/extensions/hot-memory.ts. However
          hot-memory-9 (empty hot memory → agent responds "no past session records" and
          does NOT call session_search) is NOT covered: when hot memory is empty the block
          is not injected at all (per hot-memory-5), leaving the agent with no instruction
          to decline or avoid calling session_search. The agent could still invoke
          session_search (the tool exists independently via memory-manager) in violation of
          hot-memory-9.
focus:    src/extensions/hot-memory.ts:155-175 — no instruction path for the empty-hot-memory case

### rolling-window (hot-memory-10, 11, 12)
verdict:  ✅ SATISFIED
reason:   `pruneEntries` (src/extensions/hot-memory.ts:114) implements both bounds:
          age-based pruning with a floor of MIN_ENTRIES=4 (hot-memory-11) and a cap of
          DEFAULT_MAX_ENTRIES=6 (hot-memory-10, hot-memory-12). `distillSession` prepends
          the new entry then calls `pruneEntries` before writing. All 5 pruneEntries unit
          tests and the "prepends new entry and prunes old ones" distill test pass.

## Triage

✅ Safe to skip:   rolling-window
⚠️  Worth a look:  distillation — file written to `~/.reeboot/memories/hot-memory.md` but spec says `~/.reeboot/hot-memory.md` (src/extensions/hot-memory.ts:336)
⚠️  Worth a look:  injection — `[HOT MEMORY — your recent conversations]` block label differs from spec's literal `[HOT MEMORY]` (src/extensions/hot-memory.ts:155-175); same path deviation
⚠️  Worth a look:  retrieval — hot-memory-9 (empty hot memory behavior) has no instruction path; agent may call session_search when it should not

---

## Evaluation — 2026-07-28 11:39

### distillation
verdict:  ⚠️ PARTIAL
reason:   `distillation.md` hot-memory-1 requires the entry be written to `~/.reeboot/hot-memory.md`,
          but `makeHotMemoryExtension` hardcodes `memoriesDir = join(homedir(), '.reeboot', 'memories')`
          (`hot-memory.ts:357`), writing to `~/.reeboot/memories/hot-memory.md` instead. hot-memory-2
          (zero messages → no LLM call, no write) and hot-memory-3 (LLM failure → no crash, no write)
          are both satisfied: `distillSession` returns early on empty messages and wraps `llmCall` in
          try/catch. Tests `hot-memory-distill.test.ts` pass but use a tmpDir, so they never exercise
          the production path deviation.
focus:    `reeboot/src/extensions/hot-memory.ts:357` — path is `~/.reeboot/memories/` not `~/.reeboot/`

### injection
verdict:  ⚠️ PARTIAL
reason:   hot-memory-4 (entries exist → inject `[HOT MEMORY]` block with entries + `session_search`
          instructions) is satisfied by `buildHotMemoryBlock`. hot-memory-6 (file missing → no crash,
          no injection) is satisfied (returns `''` for empty content). But hot-memory-5 is violated:
          the spec says "hot memory is empty (no entries) … does NOT inject any hot memory block …
          the system prompt is unchanged", yet `buildHotMemoryBlock` returns a
          `[HOT MEMORY] You have no past session records…` block when the file exists with only a
          header, and `hot-memory.test.ts:226` explicitly asserts this injection occurs. Because
          `initHotMemoryFile` runs at startup, the file always exists post-init, so the empty case
          always injects — directly contradicting the contract.
focus:    `reeboot/src/extensions/hot-memory.ts` `buildHotMemoryBlock` — the header-only branch
          injects when the spec forbids it

### retrieval
verdict:  ⚠️ PARTIAL
reason:   `retrieval.md` hot-memory-7/8/9 describe concrete agent behaviors (match in hot memory →
          call `session_search` → respond with actual details; no match → ask user → broader search;
          empty → respond no records, do NOT call `session_search`). The only mechanism is the
          `INSTRUCTIONS` string appended to the system prompt by `buildHotMemoryBlock`. No test
          verifies the agent actually performs these actions — they depend entirely on LLM compliance
          with the prompt. hot-memory-9's "don't call session_search when empty" is only weakly
          supported by the "no past session records" block, which itself violates hot-memory-5.
focus:    No behavioral test exists for agent retrieval actions; success is non-deterministic

### rolling-window
verdict:  ✅ SATISFIED
reason:   `rolling-window.md` hot-memory-10/11/12 are implemented by `pruneEntries` and covered by
          `hot-memory.test.ts` (keeps 6 most recent, prunes >3-day entries unless that drops below 4
          in which case 4 most recent are kept, caps at `maxEntries`). All pruning tests pass.

## Triage

✅ Safe to skip:   rolling-window
⚠️  Worth a look:
- distillation — file written to `~/.reeboot/memories/hot-memory.md` instead of the contracted `~/.reeboot/hot-memory.md`; pick one path and align code+spec
- injection — hot-memory-5 violated: header-only file triggers a "no past records" injection that the spec explicitly forbids; the test even asserts the forbidden behavior
- retrieval — agent behaviors (call `session_search`, respond with details) are only prompted, never verified; no test confirms the contract's behavioural outcomes
❓  Human call:    none — all four capabilities are specified precisely enough to judge

---

## Evaluation — 2026-07-28 11:48 (re-eval after contract corrections)

Contract corrections applied since the previous evaluation:
- `distillation.md` hot-memory-1, `injection.md` hot-memory-4/5: path corrected from
  `~/.reeboot/hot-memory.md` to `~/.reeboot/memories/hot-memory.md` (matches code + sibling
  MEMORY.md/USER.md convention; contract was wrong)
- `injection.md` hot-memory-5: rewritten to legitimise the "no past session records" awareness
  block when hot memory is empty (resolves tension with hot-memory-9; code+test were already
  correct)
- `retrieval.md` hot-memory-7/8/9: human ruling — prompting via the injected `INSTRUCTIONS`
  block is sufficient evidence; no live-LLM behavioural test required

### distillation
verdict:  ✅ SATISFIED
reason:   hot-memory-1/2/3 all met: `distillSession` writes to `~/.reeboot/memories/hot-memory.md`
          (now matching the corrected contract), returns early on zero messages (hot-memory-2),
          and swallows LLM failures without crashing or writing (hot-memory-3). Path-comment drift
          at `hot-memory.ts:13` also fixed. All `hot-memory-distill.test.ts` + integration tests pass.

### injection
verdict:  ✅ SATISFIED
reason:   hot-memory-4 (entries present → full `[HOT MEMORY]` block with entries + `session_search`
          instructions), hot-memory-5 (empty → minimal "no past session records" block, no entries,
          no `session_search` instructions), and hot-memory-6 (file missing → no crash, no injection)
          are all implemented by `buildHotMemoryBlock` and verified by `hot-memory.test.ts`. The
          test at line 226 now aligns with the corrected hot-memory-5.

### retrieval
verdict:  ✅ SATISFIED
reason:   hot-memory-7/8/9 agent behaviours are delivered via the `INSTRUCTIONS` block appended to
          the system prompt by `buildHotMemoryBlock` (match → `session_search`; no match → ask user
          → broader search; empty → no records, no `session_search`). Per human ruling, prompting
          is sufficient evidence; non-deterministic LLM compliance is accepted as inherent and not
          separately tested.

### rolling-window
verdict:  ✅ SATISFIED
reason:   Unchanged from prior evaluation — `pruneEntries` implements hot-memory-10/11/12 and all
          pruning tests pass.

## Triage

✅ All capabilities satisfied — no action required.

---
