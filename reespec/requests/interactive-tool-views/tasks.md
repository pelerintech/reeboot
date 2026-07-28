# Interactive Tool Views — tasks

## 1. Create `render_chart` tool

- [ ] **RED** — Write `tests/structured-views/render-chart.test.ts` that calls the registered `render_chart` tool via `ExtensionAPI.registerTool` pattern (same as `tests/structured-views/mcp-views.test.ts`). Assert:
  - `{ labels: ["Jan", "Feb"], values: [10, 20], kind: "bar" }` returns `{ content, view: { type: "data-chart", labels, values, kind: "bar" } }`
  - `{ labels: ["A"], values: [5], kind: "line" }` returns view with `kind: "line"`
  - Empty labels returns `isError: true`
  - Mismatched lengths returns `isError: true`
  - Run test → fails (tool not registered).
- [ ] **ACTION** — Create `src/extensions/render-chart.ts` exporting a default extension factory. Register a tool named `render_chart` with `Type.Object` schema for `{ title?: string, labels: string[], values: number[], kind: "bar" | "line" }`. Validate non-empty, matching-length arrays. Return `{ content: text summary, view: { type: "data-chart", labels, values, kind } }`.
- [ ] **GREEN** — Run `npx vitest run tests/structured-views/render-chart.test.ts` — all assertions pass. Also run `npx vitest run webchat/src/components/__tests__/DataChart.test.tsx` to confirm existing DataChart tests still pass.

## 2. Create `render_plan` tool

- [ ] **RED** — Write `tests/structured-views/render-plan.test.ts`. Assert:
  - `{ blocks: [{ type: "diagram", title: "Flow", nodes: [...], edges: [...] }] }` returns `{ content, view: { type: "plan", blocks: [...] } }`
  - Multiple block types (diagram + decision + annotated-code) all pass through
  - Empty blocks returns `isError: true`
  - Run test → fails.
- [ ] **ACTION** — Create `src/extensions/render-plan.ts`. Register a tool named `render_plan`. Accept `{ title?: string, blocks: Array<{ type: string, ... }> }`. Validate at least one block, pass through to view. Content field summarises block count/types.
- [ ] **GREEN** — Run the test — passes. Run `npx vitest run webchat/src/components/__tests__/view-registry.test.tsx` — existing PlanView tests pass.

## 3. Create ConfirmWidget React component

- [ ] **RED** — Write `webchat/src/components/__tests__/ConfirmWidget.test.tsx`. Assert:
  - Renders title, message, confirm + cancel buttons
  - Clicking confirm calls a provided `onAction` callback with `{ action: "confirm", value: true }`
  - Clicking cancel calls `onAction` with `{ action: "confirm", value: false }`
  - Run test → fails (component doesn't exist).
- [ ] **ACTION** — Create `webchat/src/components/ConfirmWidget.tsx`. Render title (h4), message (p), two buttons (confirm + cancel). Accept `{ title, message, confirmLabel?, cancelLabel?, onAction }` props. On button click, call `onAction` with structured response object.
- [ ] **GREEN** — Run `npx vitest run webchat/src/components/__tests__/ConfirmWidget.test.tsx` — all assertions pass.

## 4. Create FormWidget React component

- [ ] **RED** — Write `webchat/src/components/__tests__/FormWidget.test.tsx`. Assert:
  - Renders text input, select dropdown, and number input with labels
  - Submit calls `onAction` with `{ action: "form_submit", fields: { name: "...", type: "...", employees: 5 } }`
  - Submit button is disabled when required text field is empty (client-side validation)
  - Run test → fails.
- [ ] **ACTION** — Create `webchat/src/components/FormWidget.tsx`. Accept `{ fields: FormField[], onAction }` props. Render each field type with label. Validate that all fields have values before enabling submit. On submit, call `onAction` with structured field data.
- [ ] **GREEN** — Run the test — passes.

## 5. Wire confirm/form rendering into ToolCall.tsx

- [ ] **RED** — Write `webchat/src/components/__tests__/view-registry.test.tsx` additions. Assert:
  - `ToolCall` with `view: { type: "confirm", title: "Test", message: "Go?" }` renders ConfirmWidget (check for title text)
  - `ToolCall` with `view: { type: "form", fields: [...] }` renders FormWidget (check for field label text)
  - Existing data-table and plan rendering still works
  - Run test → fails (ToolCall doesn't handle confirm/form views).
- [ ] **ACTION** — In `webchat/src/components/ToolCall.tsx`, add `if` branches for `view?.type === "confirm"` (render ConfirmWidget) and `view?.type === "form"` (render FormWidget). Pass `onAction` callback that calls `send` on the WebSocket with `{ type: "action", action: "confirm" | "form_submit", ... }`. The `send` function needs to come from Chat.tsx via props or context.
- [ ] **GREEN** — Run the test — all assertions pass.

## 6. Add WS `action` message handler in server.ts

- [ ] **RED** — Write `tests/ws-action.test.ts`. Assert:
  - Sending `{ type: "action", action: "confirm", value: true }` over WS → a new message is published to the bus with content containing "[User confirmed: true]"
  - Sending `{ type: "action", action: "form_submit", fields: { name: "Acme" } }` → bus receives content containing "[Form Response: { name: \"Acme\" }]"
  - Unknown action type → bus receives content with the raw action data
  - Run test → fails (handler doesn't exist).
- [ ] **ACTION** — In `reeboot/src/server.ts`, in the WS `onMessage` handler, add a branch for `msg.type === "action"`. Construct a structured message from the action data and publish it to the bus as an `IncomingMessage` with appropriate content (e.g., `[User confirmed: true]` or `[Form Response: { ... }]`).
- [ ] **GREEN** — Run the test — passes.

## 7. Create `render_confirm` tool

- [ ] **RED** — Write `tests/structured-views/render-confirm.test.ts`. Assert:
  - `{ title: "Cancel?", message: "Sure?" }` returns `{ content, view: { type: "confirm", title: "Cancel?", message: "Sure?" } }`
  - Missing title returns `isError: true`
  - Optional confirmLabel and cancelLabel pass through
  - Run test → fails.
- [ ] **ACTION** — Create `src/extensions/render-confirm.ts`. Register `render_confirm`. Validate title and message required. Return view with type "confirm".
- [ ] **GREEN** — Run the test — passes.

## 8. Create `render_form` tool

- [ ] **RED** — Write `tests/structured-views/render-form.test.ts`. Assert:
  - `{ fields: [{ name: "n", label: "Name", type: "text" }] }` returns `{ content, view: { type: "form", fields: [...] } }`
  - Multiple field types (text, select, number) all pass through
  - Empty fields returns `isError: true`
  - Unknown field type returns `isError: true`
  - Run test → fails.
- [ ] **ACTION** — Create `src/extensions/render-form.ts`. Register `render_form` tool. Validate: at least one field, each field has name/label/type, type is one of "text"|"select"|"number". Return view with type "form".
- [ ] **GREEN** — Run the test — passes.

## 9. Wire view tools into bundled extension loader

- [ ] **RED** — Check: `reeboot/src/extensions/loader.ts` `getBundledFactories` does not import render-chart, render-plan, render-confirm, or render-form. Assertion fails — tools are missing.
- [ ] **ACTION** — In `getBundledFactories` (both pi and ree paths), add imports for the four new extension files. Add a config toggle `core.render_views` (default `true`) so they can be disabled. Wire them in the correct order (capabilities must still load LAST).
- [ ] **GREEN** — Verify: `getBundledFactories` includes all four new extensions. Run `npx vitest run tests/structured-views/render-chart.test.ts tests/structured-views/render-plan.test.ts tests/structured-views/render-confirm.test.ts tests/structured-views/render-form.test.ts` — all pass. Run full test suite `npx vitest run` — no regressions.

## 10. Update visual-planning.md skill

- [ ] **RED** — Check: `reeboot/skills/visual-planning.md` instructs the LLM to "Output structured JSON with view field" (text parsing approach, not tool-based). Assertion fails — skill uses the old approach.
- [ ] **ACTION** — Update `reeboot/skills/visual-planning.md` to instruct the LLM to call the `render_plan` tool instead. Change `/visual-plan` and `/visual-recap` command instructions from "output view JSON in text response" to "call the render_plan tool with the extracted blocks". Keep the block type definitions (diagram, decision, etc.) as they define the data format the tool accepts.
- [ ] **GREEN** — Verify: skill file now references `render_plan` tool, block types are preserved, no instructions to output raw JSON view in text.

## 11. Add render_chart/render_form/render_confirm prompt guidelines

- [ ] **RED** — Check: No prompt guidelines exist for the new tools. Assertion fails — LLM won't know when to call them proactively.
- [ ] **ACTION** — Create `reeboot/skills/visual-charting.md` with prompt guidelines teaching the LLM when to call `render_chart`, `render_form`, and `render_confirm`. Include examples:
  - "When the user asks for a chart, graph, or visualization of numeric data → use render_chart"
  - "When you need to collect structured information from the user (multiple fields at once) → use render_form"
  - "Before performing a destructive or consequential action → use render_confirm first"
- [ ] **GREEN** — Verify: skill file exists at `reeboot/skills/visual-charting.md`. Verify the loader picks it up via `additionalSkillPaths`. Run `npx vitest run` — no regressions.

## 12. End-to-end: LLM calls render_chart proactively

- [ ] **RED** — Write `tests/structured-views/e2e-render-chart.test.ts` (integration-level, following the pattern from `tests/visual-planning/e2e-visual-plan.test.ts`). Simulate an agent prompt where the user asks "show me a chart of test data" and verify the tool is called with expected parameters. Use the same mock-fetch pattern as the existing e2e tests. Run test → fails (not implemented).
- [ ] **ACTION** — Implement the integration test that exercises the full flow: tool registration → tool call → view result. This does NOT require a real LLM — just verify the tool is registered, its execute function works, and the view output is correctly structured.
- [ ] **GREEN** — Run `npx vitest run tests/structured-views/e2e-render-chart.test.ts` — passes.
