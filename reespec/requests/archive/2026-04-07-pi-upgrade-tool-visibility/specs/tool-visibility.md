# Spec: Tool Visibility via promptSnippet

## Capability

All 10 of reeboot's custom tools carry a `promptSnippet` field so they appear in the
system prompt's "Available tools" section on every agent session.

---

## Scenario: web_search has a promptSnippet

GIVEN the web-search extension registers `web_search`  
WHEN its `ToolDefinition` is read  
THEN `promptSnippet` is a non-empty string that does not mention a specific search backend

## Scenario: fetch_url has a promptSnippet

GIVEN the web-search extension registers `fetch_url`  
WHEN its `ToolDefinition` is read  
THEN `promptSnippet` is a non-empty string describing URL fetching

## Scenario: all scheduler tools have a promptSnippet

GIVEN the scheduler-tool extension registers `timer`, `heartbeat`, `schedule_task`,
`list_tasks`, `cancel_task`, `pause_task`, `resume_task`, `update_task`  
WHEN each `ToolDefinition` is read  
THEN every one of them has a non-empty `promptSnippet`

## Scenario: snippets appear in the built system prompt

GIVEN a pi `AgentSession` is created with reeboot's resource loader  
WHEN `session.systemPrompt` is read  
THEN the string contains `"web_search:"` and `"schedule_task:"` and `"timer:"`  
AND does not contain `"searxng"` or any other backend name
