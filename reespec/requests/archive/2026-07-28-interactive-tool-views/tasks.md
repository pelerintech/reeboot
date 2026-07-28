# Interactive Tool Views — tasks

## 1. Create `render_chart` tool

- [x] **RED** — Write `tests/structured-views/render-chart.test.ts` — test exists and covers all assertions.
- [x] **ACTION** — Create `src/extensions/render-chart.ts` — tool registered with correct validation.
- [x] **GREEN** — `npx vitest run tests/structured-views/render-chart.test.ts` — all 4 tests pass.

## 2. Create `render_plan` tool

- [x] **RED** — Write `tests/structured-views/render-plan.test.ts` — test exists and covers all assertions.
- [x] **ACTION** — Create `src/extensions/render-plan.ts` — tool registered with block validation.
- [x] **GREEN** — `npx vitest run tests/structured-views/render-plan.test.ts` — all 3 tests pass.

## 3. Create ConfirmWidget React component

- [x] **RED** — Write `webchat/src/components/__tests__/ConfirmWidget.test.tsx` — test exists and covers all assertions.
- [x] **ACTION** — Create `webchat/src/components/ConfirmWidget.tsx` — component renders title, message, and two buttons.
- [x] **GREEN** — `npx vitest run webchat/src/components/__tests__/ConfirmWidget.test.tsx` — all 3 tests pass.

## 4. Create FormWidget React component

- [x] **RED** — Write `webchat/src/components/__tests__/FormWidget.test.tsx` — test exists and covers all assertions.
- [x] **ACTION** — Create `webchat/src/components/FormWidget.tsx` — component renders all field types with validation.
- [x] **GREEN** — `npx vitest run webchat/src/components/__tests__/FormWidget.test.tsx` — all 3 tests pass.

## 5. Wire confirm/form rendering into ToolCall.tsx

- [x] **RED** — Write `webchat/src/components/__tests__/view-registry.test.tsx` — confirm/form rendering tests exist.
- [x] **ACTION** — In `webchat/src/components/ToolCall.tsx`, confirm and form views wired with `onAction` → WebSocket via Chat.tsx. `surfaceId` now generated via `useId()`.
- [x] **GREEN** — `npx vitest run webchat/src/components/__tests__/view-registry.test.tsx` — all 9 tests pass.

## 6. Add WS `action` message handler in server.ts

- [x] **RED** — Write `tests/ws-action.test.ts` — action message handling tests exist.
- [x] **ACTION** — In `reeboot/src/server.ts`, WS `onMessage` handler handles `msg.type === 'action'` with confirm, form_submit, and unknown branches.
- [x] **GREEN** — `npx vitest run tests/ws-action.test.ts` — all 4 tests pass.

## 7. Create `render_confirm` tool

- [x] **RED** — Write `tests/structured-views/render-confirm.test.ts` — test exists and covers all assertions.
- [x] **ACTION** — Create `src/extensions/render-confirm.ts` — tool registered with title/message validation.
- [x] **GREEN** — `npx vitest run tests/structured-views/render-confirm.test.ts` — all 3 tests pass.

## 8. Create `render_form` tool

- [x] **RED** — Write `tests/structured-views/render-form.test.ts` — test exists and covers all assertions.
- [x] **ACTION** — Create `src/extensions/render-form.ts` — tool registered with field type validation.
- [x] **GREEN** — `npx vitest run tests/structured-views/render-form.test.ts` — all 4 tests pass.

## 9. Wire view tools into bundled extension loader

- [x] **RED** — `getBundledFactories` did not include render views — assertion satisfied.
- [x] **ACTION** — Added four render view tools to `getBundledFactories` with `core.render_views` toggle (default `true`).
- [x] **GREEN** — `npx vitest run tests/structured-views/loader-views.test.ts` — 2 tests pass. All structured view tests pass (38/38).

## 10. Update visual-planning.md skill

- [x] **RED** — `visual-planning.md` used old JSON output approach — assertion satisfied.
- [x] **ACTION** — Updated `visual-planning.md` to reference `render_plan` tool. Block type definitions preserved.
- [x] **GREEN** — Skill file references `render_plan` tool (3 occurrences). No raw JSON view output instructions.

## 11. Add render_chart/render_form/render_confirm prompt guidelines

- [x] **RED** — No prompt guidelines existed — assertion satisfied.
- [x] **ACTION** — Created `reeboot/skills/visual-charting.md` with guidelines for render_chart, render_form, render_confirm.
- [x] **GREEN** — Skill file exists at `reeboot/skills/visual-charting.md`. `npx vitest run tests/structured-views/visual-charting-skill.test.ts` — 1 test passes.

## 12. End-to-end: LLM calls render_chart proactively

- [x] **RED** — No e2e test existed — assertion satisfied.
- [x] **ACTION** — Created `tests/structured-views/e2e-render-chart.test.ts` testing registration → execution → view output.
- [x] **GREEN** — `npx vitest run tests/structured-views/e2e-render-chart.test.ts` — 1 test passes.
