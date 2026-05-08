---
title: "Extensions"
description: "Write TypeScript pi extensions to add tools, hooks, and custom behaviour to reeboot."
---

# Extensions

Extensions are TypeScript files that plug into pi's extension system. They can register custom tools, inject content into the system prompt, intercept events, and react to the agent's lifecycle. Extensions are the most powerful way to extend reeboot.

---

## User Extensions

Drop a `.ts` file into `~/.reeboot/extensions/`. It is loaded on startup and on `reeboot reload`.

```typescript
// ~/.reeboot/extensions/weather.ts
export default function makeWeatherExtension(pi: any) {
  pi.registerTool({
    name: 'get_weather',
    description: 'Get current weather for a city',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' }
      },
      required: ['city']
    },
    handler: async ({ city }: { city: string }) => {
      // your implementation
      return `Weather in ${city}: sunny, 22°C`;
    }
  });
}
```

Hot-reload without restart:

```bash
reeboot reload
```

---

## Available Hooks

Extensions can subscribe to lifecycle events:

| Hook / API | When it fires | Return value |
|---|---|---|
| `pi.registerTool(def)` | Call during extension init to register a custom tool | — (registration, not a hook) |
| `before_agent_start` | Before the LLM is called for a turn | `{ systemPrompt?: string }` — inject content into system prompt |
| `agent_end` | After the agent completes a turn | `void` |
| `turn_start` | At the start of each retry within a turn | `void` |
| `turn_end` | At the end of each retry within a turn | `void` |
| `session_shutdown` | When the session is closed | `void` |
| `after_provider_response` | After the LLM responds | `void` — access usage/cost data |

**Injecting system prompt content** (use `before_agent_start`, not `turn_start`):

```typescript
pi.on('before_agent_start', async () => {
  return {
    systemPrompt: 'Always respond in Spanish.\n'
  };
});
```

---

## Core Extensions

Reeboot ships several built-in extensions. All are enabled by default and can be toggled in config:

| Key | Default | Description |
|---|---|---|
| `extensions.core.sandbox` | `true` | OS-level bash sandboxing |
| `extensions.core.confirm_destructive` | `true` | Confirm before destructive operations |
| `extensions.core.protected_paths` | `true` | Block writes to sensitive paths |
| `extensions.core.git_checkpoint` | `false` | Auto-commit before destructive ops (opt-in) |
| `extensions.core.session_name` | `true` | Human-readable session names |
| `extensions.core.custom_compaction` | `true` | Summarise old turns instead of truncating |
| `extensions.core.scheduler_tool` | `true` | schedule_task, timer, heartbeat tools |
| `extensions.core.token_meter` | `true` | Track token/cost usage per turn |
| `extensions.core.mcp` | `true` | MCP proxy tool |
| `extensions.core.injection_guard` | `true` | Prompt injection detection |

Disable a core extension:

```json
{
  "extensions": {
    "core": { "git_checkpoint": true }
  }
}
```

---

## Community Packages

Extensions can be distributed as npm packages and installed with:

```bash
reeboot install npm:reeboot-github-tools
```

→ See [Packages](./packages.md) for the full package system reference.

---

## Dev Notes

- Extensions run in the same process as reeboot — no isolation. Trust your extensions.
- Extensions loaded from `~/.reeboot/extensions/` are user-scope; extensions bundled inside `src/extensions/` are core.
- The `pi` object passed to extension factories is pi's `ExtensionAPI`. Refer to pi's documentation for the full API surface.
- Use `require('../db/index.js').getDb()` to access the reeboot SQLite database from an extension (same pattern as core extensions).
