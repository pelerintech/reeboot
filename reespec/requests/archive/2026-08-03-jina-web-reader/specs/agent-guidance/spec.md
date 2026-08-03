# Spec — Agent guidance (before_agent_start)

## Capability

When the Jina sidekick is healthy, a `before_agent_start` handler injects a
system-prompt block that teaches the agent the decision rules for choosing between
`jina_read`, `jina_search`, `web_search`, and `fetch_url`. The guidance only mentions
a tool if that tool is actually available: `jina_read` is always mentioned when the
sidekick is healthy, but `jina_search` is mentioned only when the search route was
confirmed available (so the agent is never steered toward a tool that can't work).
When the sidekick is absent, no such block is injected (the agent keeps its existing
baseline behaviour).

## Scenarios

### GIVEN a healthy sidekick with a working search route
WHEN `before_agent_start` fires
THEN the returned `systemPrompt` includes a block mentioning `jina_read`
AND the returned `systemPrompt` includes `jina_search`
AND the returned prompt is `event.systemPrompt + <block>` (composes, not replaces)

### GIVEN a healthy sidekick where the search route is unavailable
WHEN `before_agent_start` fires
THEN the returned `systemPrompt` includes the `jina_read` guidance
AND the returned `systemPrompt` does NOT mention `jina_search`

### GIVEN a healthy sidekick
WHEN the injected block is inspected
THEN it instructs: having a specific URL → prefer `jina_read` over `fetch_url`
AND (when search available) it instructs: gathering info across pages → prefer
`jina_search` over `web_search`
AND it instructs: fall back to `web_search`/`fetch_url` when Jina throws

### GIVEN the sidekick is NOT healthy (or `jina_base_url` empty)
WHEN `before_agent_start` fires
THEN the returned `systemPrompt` is unchanged from the input (no Jina block added)

### GIVEN the extension is disabled via `web.enabled: false`
WHEN the extension loads
THEN no tools are registered and no guidance is injected
