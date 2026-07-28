## Evaluation — 2026-07-28 13:15

### render_chart — chart view output & validation
verdict:  ✅ SATISFIED
reason:   Specs C1–C5 require bar/line data-chart views, empty-label rejection, length-mismatch rejection, and a text content fallback. `reeboot/src/extensions/render-chart.ts` returns `{ content, view: { type: "data-chart", labels, values, kind } }`, validates empty arrays and mismatched lengths with `isError: true`, and emits a human-readable `content` summary. `reeboot/webchat/src/components/DataChart.tsx` renders bar (`<rect>`) and line (`<path>` + `<circle>`) SVG elements. `tests/structured-views/render-chart.test.ts` (4 tests) and `webchat/.../DataChart.test.tsx` pass.

### render_plan — plan view output & validation
verdict:  ✅ SATISFIED
reason:   Specs P1–P5 require diagram/multi-block views, empty-block rejection, unknown-type pass-through with JSON fallback, and a content summary. `reeboot/src/extensions/render-plan.ts` validates empty blocks and passes all blocks through. `reeboot/webchat/src/components/PlanView.tsx` implements all five block sub-renderers (`DiagramView`, `WireframeView`, `AnnotatedCodeView`, `DecisionView`, `FileTreeView`) with SVG nodes/edges for diagrams, and a JSON-card default for unknown types. `tests/structured-views/render-plan.test.ts` (3 tests) passes.

### render_confirm — ConfirmWidget rendering & action dispatch
verdict:  ⚠️ PARTIAL
reason:   CF1 (renders title, message, two buttons) is met by `ConfirmWidget.tsx` and its test. CF2/CF3 require the WS message `{ type: "action", action: "confirm", value, surfaceId: "<confirm-view-id>" }`. `ToolCall.tsx:68` injects `surfaceId: view.surfaceId` and `Chat.tsx:268` sends `{ type: 'action', ...action }`, so the message structure is correct — but `view.surfaceId` is never populated: `render-confirm.ts` emits no `surfaceId` on the view and no code path assigns one, so the field is always `undefined`.
focus:    `reeboot/src/extensions/render-confirm.ts` (view has no surfaceId), `reeboot/webchat/src/components/ToolCall.tsx:68` (reads `view.surfaceId`)

### render_confirm — tool & validation
verdict:  ✅ SATISFIED
reason:   CF4/CF5/CF6 require the tool to return a confirm view, reject missing title, and produce a content fallback. `render-confirm.ts` returns `{ content, view: { type: "confirm", title, message, confirmLabel, cancelLabel } }`, returns `isError: true` when title/message are missing, and builds content text `"… Reply 'yes' to confirm or 'no' to cancel."`. `tests/structured-views/render-confirm.test.ts` (3 tests) passes.

### render_confirm — server action handling
verdict:  ✅ SATISFIED
reason:   CF7 requires the server to handle `{ type: "action", action: "confirm", value, surfaceId }` by injecting `"[User confirmed: true]"` and triggering a new turn. `reeboot/src/server.ts:836-853` handles `msg.type === 'action'`, builds `[User confirmed: ${msg.value ?? false}]`, and publishes an incoming message on the bus (the canonical turn-trigger path used by regular messages). `tests/ws-action.test.ts` passes.

### render_form — FormWidget rendering & action dispatch
verdict:  ⚠️ PARTIAL
reason:   F1 (text/select/number fields with labels) and F3 (required-field validation, disabled submit) are met by `FormWidget.tsx` and its test. F2 requires the WS message `{ type: "action", action: "form_submit", fields, surfaceId: "<form-view-id>" }`. `ToolCall.tsx:77` injects `surfaceId: view.surfaceId` and `Chat.tsx:268` sends the message — but as with confirm, `view.surfaceId` is never populated by `render-form.ts` or any other code path, so the field is always `undefined`.
focus:    `reeboot/src/extensions/render-form.ts` (view has no surfaceId), `reeboot/webchat/src/components/ToolCall.tsx:77` (reads `view.surfaceId`)

### render_form — tool & validation
verdict:  ✅ SATISFIED
reason:   F4–F7 require a form view, empty-fields rejection, unknown-type rejection, and a content fallback. `render-form.ts` returns `{ content, view: { type: "form", fields } }`, rejects empty `fields` and non-`text/select/number` types with `isError: true`, and builds `"Please provide: <label> (<type>)"` summaries. `tests/structured-views/render-form.test.ts` (4 tests) passes.

### render_form — server action handling
verdict:  ✅ SATISFIED
reason:   F8 requires the server to handle `{ type: "action", action: "form_submit", fields, surfaceId }` by injecting `"[Form Response: {...}]"` and triggering a new turn. `reeboot/src/server.ts:844` builds `[Form Response: ${JSON.stringify(msg.fields ?? {})}]` and publishes to the bus. `tests/ws-action.test.ts` covers the form_submit path.

### Proactive LLM usage
verdict:  ✅ SATISFIED
reason:   Brief item 4 requires "tool descriptions and prompt guidelines [to] teach the LLM when to call these tools naturally (not just via slash commands)." Each tool's `description` includes "Call this when…" guidance (`render-chart.ts`, `render-form.ts`, `render-confirm.ts`, `render-plan.ts`). `reeboot/skills/visual-charting.md` provides "When to Use" guidelines for chart/form/confirm, and `reeboot/skills/visual-planning.md` documents `render_plan` block types and tool usage.

## Triage

✅ Safe to skip:   render_chart, render_plan, render_confirm (tool & validation), render_confirm (server action handling), render_form (tool & validation), render_form (server action handling), Proactive LLM usage
⚠️  Worth a look:  ConfirmWidget action dispatch (CF2/CF3) — `surfaceId` field is wired into the WS message but never populated with a view ID; FormWidget action dispatch (F2) — same `surfaceId` gap
❓  Human call:    none — all contract ambiguities were resolvable from outputs

---

## Evaluation — 2026-07-28 14:40

### render-plan-tool
verdict:  ✅ SATISFIED
reason:   render-plan.md requires diagram/multiple-block/empty-unknown validation/content fallback (P1–P5).
          `reeboot/src/extensions/render-plan.ts` rejects empty blocks with `isError: true` (P3), passes
          unknown block types through (P4), returns `{content, view:{type:'plan',blocks}}`, and produces a
          text `content` summary (P5). `reeboot/webchat/src/components/PlanView.tsx` renders an SVG diagram
          with node `<rect>`s and directed `<line>` edges with an arrowhead `<marker>` (P1), plus
          WireframeView/AnnotatedCodeView/DecisionView/FileTreeView sub-components (P2) and a JSON `<pre>`
          fallback for unknown blocks (P4). All 3 render-plan tests pass.

### render-chart-tool
verdict:  ✅ SATISFIED
reason:   render-chart.md requires bar/line chart views, empty/mismatched-length validation, and content
          fallback (C1–C5). `reeboot/src/extensions/render-chart.ts` returns `{content, view:{type:'data-chart',
          labels,values,kind}}`, rejects empty arrays (C3) and mismatched lengths (C4) with `isError: true`,
          and emits a text summary (C5). `reeboot/webchat/src/components/DataChart.tsx` renders bar `<rect>`
          elements for `kind:'bar'` (C1) and a `<path>` + `<circle>` points for `kind:'line'` (C2). All 4
          render-chart tests pass. (Spec C2's expected `values:[15,10]` appears to be a typo for the
          `[5,15,10]` input; implementation correctly echoes the actual input.)

### render-form-tool-and-widget
verdict:  ✅ SATISFIED
reason:   render-form.md covers the tool, FormWidget, and server handling (F1–F8).
          `reeboot/src/extensions/render-form.ts` returns form views (F4), rejects empty fields (F5) and
          unknown types like `checkbox` (F6) with `isError: true`, and produces a `content` listing
          (F7). `reeboot/webchat/src/components/FormWidget.tsx` renders text/select/number inputs with
          labels (F1), disables submit until all fields filled (F3), and dispatches
          `onAction({action:'form_submit', fields})` (F2). `ToolCall.tsx:33,79` attaches `surfaceId` and
          `Chat.tsx:268` sends `{type:'action', ...action}` over WS. Server `reeboot/src/server.ts:844–857`
          builds `[Form Response: {…}]` and `_bus.publish`es an IncomingMessage (F8); the orchestrator
          subscribes via `onMessage` (`orchestrator.ts:162`) so a new turn is triggered. All 4 render-form
          + 4 FormWidget tests pass.

### render-confirm-tool-and-widget
verdict:  ✅ SATISFIED
reason:   render-confirm.md covers the tool, ConfirmWidget, and server handling (CF1–CF7).
          `reeboot/src/extensions/render-confirm.ts` requires `title`+`message`, rejects missing title with
          `isError: true` (CF5), returns confirm views (CF4), and produces a `content` fallback (CF6).
          `reeboot/webchat/src/components/ConfirmWidget.tsx` renders title, message, and two buttons
          (CF1); the confirm button calls `onAction({action:'confirm', value:true})` (CF2) and cancel
          sends `value:false` (CF3), with `surfaceId` attached in `ToolCall.tsx:33,70`. Server
          `reeboot/src/server.ts:842–843` builds `[User confirmed: <value>]` and publishes via the bus
          (CF7), triggering a new orchestrator turn. All 3 render-confirm + ConfirmWidget tests pass.

### channel-aware-rendering
verdict:  ⚠️ PARTIAL
reason:   Brief "What needs to exist" #3 states "each channel adapter renders views appropriately (widget in
          webchat, text fallback in WhatsApp/Signal/Telegram, Inquirer in CLI)." The text-fallback half is
          satisfied: every tool emits a `content` string (P5/C5/F7/CF6), and the brief's non-goal defers
          form/confirm rendering in non-webchat channels to a later request. But for plan/chart there is no
          evidence that the WhatsApp, Signal, Telegram, or CLI adapters actually render the `view` (widget
          or Inquirer equivalent) — only the `content` text is produced. No spec or test exercises
          non-webchat adapter rendering of plan/chart views.
focus:    `reeboot/src/channels/` (whatsapp/signal/telegram/cli adapters) — verify whether `view` is
          consumed or only `content`; brief goal #3 claims "each channel adapter renders views appropriately"

### proactive-llm-usage
verdict:  ✅ SATISFIED
reason:   Brief "What needs to exist" #4 requires "tool descriptions and prompt guidelines teach the LLM when
          to call these tools naturally." Each tool registers a `description` with usage guidance
          (`render-*.ts`), and prompt-guideline skill files exist: `reeboot/skills/visual-charting.md`
          ("render_chart — When to Use" with examples for render_chart/render_form/render_confirm) and
          `reeboot/skills/visual-planning.md` (instructs calling `render_plan` with block-type
          documentation). `skill-update.test.ts` and `visual-charting-skill.test.ts` pass.

## Triage

✅ Safe to skip:   render-plan-tool, render-chart-tool, render-form-tool-and-widget,
                   render-confirm-tool-and-widget, proactive-llm-usage
⚠️  Worth a look:  channel-aware-rendering — only `content` text fallback is verified for non-webchat
                   channels; no evidence plan/chart `view` widgets render in WhatsApp/Signal/Telegram/CLI
                   adapters (brief goal #3 explicitly claims "each channel adapter renders views
                   appropriately")
❓  Human call:    none

---

## Evaluation — 2026-07-28 15:05

### render_plan tool
verdict:  ✅ SATISFIED
reason:   render-plan.md P1–P5 all met. `reeboot/src/extensions/render-plan.ts` returns
          `{ content: "Plan with N block(s)…", view: { type: "plan", blocks } }` (P1, P5),
          validates `blocks.length === 0` → `isError: true` "At least one block is required"
          (P3), passes unknown types through (P4). `PlanView.tsx` renders diagram (SVG with
          `markerEnd="url(#arrowhead)"` directed edges), decision, annotated-code, file-tree,
          and wireframe sub-components, plus a JSON fallback card for unknown types (P2, P4).
          `render-plan.test.ts` (3 tests) passes.

### render_confirm tool and ConfirmWidget
verdict:  ✅ SATISFIED
reason:   render-confirm.md CF1–CF7 all met. `ConfirmWidget.tsx` renders title, message,
          two buttons (CF1); `onAction({ action: 'confirm', value: true/false })` is wrapped
          by `ToolCall.tsx` with `surfaceId` and dispatched as `{ type: 'action', action:
          'confirm', value, surfaceId }` via `send()` in `Chat.tsx` (CF2, CF3).
          `render-confirm.ts` returns the confirm view (CF4), rejects missing title/message
          → `isError` (CF5), produces content fallback text (CF6). `server.ts:834` handles
          `type:'action'` → builds `[User confirmed: ${value}]` and publishes to the bus to
          trigger a new turn (CF7). Tests: `render-confirm.test.ts` (3) +
          `ConfirmWidget.test.tsx` pass.

### render_form tool and FormWidget
verdict:  ✅ SATISFIED
reason:   render-form.md F1–F8 all met. `FormWidget.tsx` renders text/select/number inputs
          with labels (F1); submit dispatches `{ type:'action', action:'form_submit',
          fields, surfaceId }` (F2); submit button is `disabled={!allFilled}` and
          `handleSubmit` early-returns when `!allFilled`, so no WS message is sent (F3).
          `render-form.ts` returns the form view (F4), rejects empty `fields` array (F5) and
          unknown field types via `ALLOWED_TYPES` check (F6), produces `Please provide: …`
          fallback (F7). `server.ts:844` handles `form_submit` → `[Form Response: {…}]` +
          new turn (F8). Tests: `render-form.test.ts` (4) + `FormWidget.test.tsx` pass.

### render_chart tool
verdict:  ✅ SATISFIED
reason:   render-chart.md C1–C5 all met. `render-chart.ts` returns `{ content: "Chart: N
          data points…", view: { type: "data-chart", labels, values, kind } }` for bar and
          line (C1, C2, C5); rejects empty labels/values → `isError` "Labels and values
          must be non-empty arrays." (C3) and mismatched lengths → `isError` (C4).
          `DataChart.tsx` renders bar `<rect>` and line `<path>` + `<circle>` SVG elements
          with Y-axis grid. Tests: `render-chart.test.ts` (4) + `e2e-render-chart.test.ts` +
          `DataChart.test.tsx` pass. (Note: spec C2's example `values:[15,10]` vs
          `labels:["A","B","C"]` is internally inconsistent in the contract itself, but the
          implemented validation and view shape satisfy the capability.)

### Channel content delivery (non-webchat)
verdict:  ✅ SATISFIED
reason:   channel-delivery.md D1–D5 all met in `orchestrator.ts:428–444` and
          `structured-views.ts:extractContentText`. Non-webchat path (`else if
          tool_call_end && view && adapter`) calls `adapter.send(peerId, { type:'text',
          text: fallback })` (D1); when `sendEvent` exists only `sendEvent` is called, no
          duplicate `send()` (D2); fallback requires `event.view`, so viewless tools are not
          re-delivered (D3); `.catch(() => {})` swallows transport failures (D4).
          `extractContentText` handles `content` string, `content` array-of-text-blocks,
          bare string, and bare array; returns `null` → no `send()` when no text (D5).
          `orchestrator-view-delivery.test.ts` (4) + `content-fallback.test.ts` (9) +
          `ws-view-propagation.test.ts` pass; the "transport down" log is the D4 test.

### proactive-llm-usage (brief goal, no spec)
verdict:  ❓ UNCLEAR
reason:   brief.md states "Proactive LLM usage — tool descriptions and prompt guidelines
          teach the LLM when to call these tools naturally (not just via slash commands)",
          but no spec in `specs/` defines acceptance criteria for "prompt guidelines" —
          what artifact, what content, what thresholds. Tool `description` fields exist
          on each registered tool and skill files (`reeboot/skills/visual-charting.md`,
          `visual-planning.md`) exist, but the contract does not specify what counts as
          "teaching the LLM when to call naturally," so pass/fail cannot be judged from the
          contract alone.
focus:    human call — clarify what "prompt guidelines" must exist (e.g., a system-prompt
          section, a skills file, tool-description wording) before re-evaluating.

## Triage

✅ Safe to skip:   render_plan, render_confirm, render_form, render_chart, channel-delivery
⚠️  Worth a look:  — (none)
❓  Human call:    proactive-llm-usage — brief lists it as a goal but no spec defines what
                   "prompt guidelines" artifact or criteria are required; judge intent first.

---
