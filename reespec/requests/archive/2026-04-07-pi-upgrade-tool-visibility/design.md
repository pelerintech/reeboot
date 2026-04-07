# Design: pi Upgrade + Tool Visibility

## The two-channel problem

Pi gives tools two ways to communicate with the model:

```
1. Tool schema (every API call)
   → name, description, input_schema
   → model uses this to execute a tool correctly
   → model does NOT proactively scan schemas before deciding to act

2. System prompt "Available tools" section
   → one line per tool: "- web_search: Search the web..."
   → model reads this at the start of every turn
   → drives proactive tool selection before reasoning begins
   → only populated if promptSnippet is set on the ToolDefinition
```

Without `promptSnippet`, pi still emits:
> "In addition to the tools above, you may have access to other custom tools depending on the project."

This is too vague to drive reliable behaviour. With `promptSnippet` on all tools, the
system prompt becomes:

```
Available tools:
- read: Read file contents
- bash: Execute bash commands
- edit: Make surgical edits to files
- write: Create or overwrite files
- web_search: Search the web and return results with title, URL, and snippet
- fetch_url: Fetch a URL and return its readable text content
- timer: Set a one-shot non-blocking delay that fires a new agent turn
- heartbeat: Manage a recurring periodic turn trigger
- schedule_task: Schedule a task by cron, interval, or datetime
- list_tasks: List all scheduled tasks with status and next run time
- cancel_task: Cancel and delete a scheduled task by ID
- pause_task: Pause a scheduled task without deleting it
- resume_task: Resume a paused task, recomputing its next run
- update_task: Update a task's prompt, schedule, or context mode
```

## Upgrade: 0.60.0 → 0.62.0

### Breaking changes audit

| Change (0.61–0.62) | Reeboot affected? | Reason |
|---|---|---|
| `getPathMetadata()` removed from `ResourceLoader` | No | Reeboot never calls it |
| `Skill.source` removed, use `sourceInfo.source` | No | skill-manager doesn't read `.source` |
| `RegisteredCommand.extensionPath` removed | No | No command provenance reads |
| `RegisteredTool.extensionPath` removed | No | No tool provenance reads |
| `ToolDefinition.renderCall/renderResult` semantics | No | No custom renderers defined |
| Keybinding IDs namespaced (0.61.0) | No | No `keyHint()`/`keyText()` calls |

Verdict: **no code changes required for the upgrade itself**.

### What changes in package.json

```json
"@mariozechner/pi-coding-agent": "0.62.0"
```

Pin to exact version (not `latest`) so Docker builds are reproducible.

## promptSnippet wording

Snippets are one short clause — what the tool does, action-oriented, no backend names.

### web-search.ts

| Tool | promptSnippet |
|---|---|
| `web_search` | `"Search the web and return results with title, URL, and snippet"` |
| `fetch_url` | `"Fetch a URL and return its readable text content"` |

### scheduler-tool.ts

| Tool | promptSnippet |
|---|---|
| `timer` | `"Set a one-shot non-blocking delay that fires a new agent turn"` |
| `heartbeat` | `"Manage a recurring periodic turn trigger"` |
| `schedule_task` | `"Schedule a task by cron, interval, or datetime"` |
| `list_tasks` | `"List all scheduled tasks with status and next run time"` |
| `cancel_task` | `"Cancel and delete a scheduled task by ID"` |
| `pause_task` | `"Pause a scheduled task without deleting it"` |
| `resume_task` | `"Resume a paused task, recomputing its next run"` |
| `update_task` | `"Update a task's prompt, schedule, or context mode"` |

## Risks

**Low**: The upgrade is a minor bump with no reeboot-touching breaking changes. Verified
against pi's changelog and type definitions.

**None**: `promptSnippet` is additive — it cannot break tool execution, only adds a line
to the system prompt. If wording is ever wrong, it's a one-line fix.
