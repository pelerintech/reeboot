# Brief: pi Upgrade + Tool Visibility

## What

Upgrade the bundled `@mariozechner/pi-coding-agent` dependency from **0.60.0** to **0.62.0**
and add `promptSnippet` to all 10 of reeboot's custom tools so the model sees them
explicitly in the system prompt's "Available tools" section.

## Why

**Upgrade**: 0.62.0 contains two minor releases of bug fixes and the `sourceInfo` unification.
None of the breaking changes touch reeboot's code surface, so the upgrade is low-risk and
keeps reeboot current.

**Tool visibility**: Without `promptSnippet`, pi omits custom tools from the "Available tools"
section of the system prompt. The model still receives the tool schemas at API call time, but
lacks upfront awareness of what tools exist. This causes the model to under-use tools
proactively — particularly `web_search` and the scheduler tools — because it only discovers
them reactively. Adding short, action-oriented snippets makes all tools visible from the first
token of every turn.

## Goals

- Bump `@mariozechner/pi-coding-agent` to `0.62.0` in `reeboot/package.json`
- Add `promptSnippet` to `web_search` and `fetch_url` in `web-search.ts`
- Add `promptSnippet` to all 8 scheduler tools in `scheduler-tool.ts`
- All existing tests pass after the upgrade

## Non-goals

- Changing `promptGuidelines` — snippets alone are sufficient reinforcement
- Modifying AGENTS.md templates — no tool documentation needed there
- Changing tool `description` fields — those are already good for schema use
- Forking or patching pi's system prompt template

## Impact

Every reeboot agent session. The model will see all custom tools listed by name in the
system prompt from session start, making proactive tool use more reliable without any
user configuration change.
