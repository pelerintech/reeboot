# Interactive Tool Views — Design

## Architecture

```
                    View-Producing Tools
                    ────────────────────

  LLM calls: render_plan / render_chart / render_form / render_confirm
       │
       ▼
  Tool validates input, returns { content, view }
       │
       ▼
  pi-runner.ts extracts `view` from tool result (existing code)
       │
       ▼
  Orchestrator sends tool_call_end event with view (existing code)
       │
       ▼
  WebSocket → Chat.tsx → ToolCall.tsx renders the view
       │
       ├── data-table  → DataTable (exists)
       ├── data-chart  → DataChart (exists, needs tool)
       ├── plan        → PlanView (exists, needs tool)
       ├── form        → FormWidget (needs new component)
       └── confirm     → ConfirmWidget (needs new component)
```

### Interactive Views — Response Flow

```
  User fills form / clicks confirm
       │
       ▼
  Webchat sends: { type: "action", action: "form_submit" | "confirm", fields: {...} }
  (new WS message type, follows same protocol as existing message/cancel)
       │
       ▼
  Server injects structured message into conversation:
  "[Form Response: { company_name: "Acme", company_type: "Tech" }]"
       │
       ▼
  New turn: LLM sees the structured data and responds
```

### Channel-Aware Fallback

```
  Tool returns: { content: "Please provide your name and email", view: { type: "form", ... } }
       │
       ▼
  ┌─────────────────┬──────────────────────┬─────────────────────────┐
  │ Channel          │ View rendering       │ Response mechanism      │
  ├─────────────────┼──────────────────────┼─────────────────────────┤
  │ Webchat          │ Interactive widget   │ Structured WS message   │
  │ WhatsApp         │ Text + buttons       │ Interactive message tap │
  │ Signal/Telegram  │ Text fallback only   │ User types reply text   │
  │ CLI              │ Inquirer prompt      │ Terminal input          │
  └─────────────────┴──────────────────────┴─────────────────────────┘
  The `content` field is the universal fallback — every channel gets at least text.
```

## Components

### New Tools

#### `render_plan`
- **Input**: `{ title?: string, blocks: Array<DiagramBlock | WireframeBlock | AnnotatedCodeBlock | DecisionBlock | FileTreeBlock> }`
- **Output**: `{ content: string, view: { type: "plan", blocks } }`
- **Validation**: Basic schema validation, returns view data as-is

#### `render_chart`
- **Input**: `{ title?: string, labels: string[], values: number[], kind: "bar" | "line" }`
- **Output**: `{ content: string, view: { type: "data-chart", labels, values, kind } }`
- **Validation**: Labels and values must be non-empty arrays of same length

#### `render_form`
- **Input**: `{ title?: string, fields: Array<{ name, label, type: "text"|"select"|"number", options?: string[] }> }`
- **Output**: `{ content: string, view: { type: "form", fields } }`
- **Validation**: At least one field required

#### `render_confirm`
- **Input**: `{ title: string, message: string, confirmLabel?: string, cancelLabel?: string }`
- **Output**: `{ content: string, view: { type: "confirm", title, message, confirmLabel, cancelLabel } }`
- **Validation**: Title and message required

### New WebSocket Message Type

```typescript
// Client → Server
{ type: "action", action: "form_submit" | "confirm", fields?: Record<string, unknown>, value?: boolean, surfaceId?: string }
```

### New React Components

- `FormWidget` — renders form fields (text input, select dropdown, number input), handles validation, dispatches `action` WS message on submit
- `ConfirmWidget` — renders title + message + Approve/Deny buttons, dispatches `action` WS message on click

### Skill Updates

- `reeboot/skills/visual-planning.md` — update to instruct LLM to call `render_plan` tool instead of outputting raw JSON
- New skill or prompt guidelines for `render_chart`, `render_form`, `render_confirm`

## Channel Adapter Contract

Each channel adapter that handles interactive views must:

1. **Check capability**: Does this channel support interactive widgets? (webchat=yes, whatsapp=partial, signal=text-only)
2. **Render appropriately**: widget vs buttons vs text
3. **Capture response**: structured message vs text parsing
4. **Route response back**: to the agent's conversation

For v1, only webchat implements the full interactive path (widget + structured WS response). Other channels use the `content` text fallback and the user types their response as text, which the LLM parses naturally.

## Implementation Order

1. `render_chart` tool + DataChart (lowest risk, passive only)
2. `render_plan` tool + PlanView (passive, data format already defined)
3. `render_confirm` tool + ConfirmWidget + WS action message type (interactive)
4. `render_form` tool + FormWidget + WS action message type (interactive)
5. Skill/prompt updates for proactive LLM usage
6. Channel adapter extensions (WhatsApp, Signal, etc.) — deferred
