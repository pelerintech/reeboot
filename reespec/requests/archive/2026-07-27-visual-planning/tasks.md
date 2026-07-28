# Tasks — visual planning

Note: This request depends on `structured-tool-views` for the rendering infrastructure. The skill file and agent instructions can be authored independently, but the `PlanView` component requires the `view` propagation system to be in place.

---

### 1. Create visual planning skill file

- [x] **RED** — Skill file `reeboot/skills/visual-planning.md` did not exist initially.
- [x] **ACTION** — Created `reeboot/skills/visual-planning.md` with:
  - Description of the `/visual-plan` and `/visual-recap` commands
  - Structured output format for each block type (diagram, wireframe, annotated-code, decision, file-tree)
  - Explicit examples for each block type
  - Instruction to always include a text description in `content` for non-WebChat channels
  - Instruction to read `brief.md` and `design.md` for `/visual-plan`
  - Instruction to read `tasks.md` for `/visual-recap`
- [x] **GREEN** — `reeboot/skills/visual-planning.md` exists and contains all 5 block types with JSON examples.

### 2. Create PlanView React component

- [x] **RED** — `reeboot/webchat/src/components/__tests__/PlanView.test.tsx` written with 6 tests (diagram SVG, wireframe, annotated-code, decision, file-tree, unknown fallback). Test failed initially — component didn't exist.
- [x] **ACTION** — Created `reeboot/webchat/src/components/PlanView.tsx` with:
  - Accepts a `blocks` array of typed plan blocks
  - Dispatches each block to its renderer based on `block.type`
  - Renders diagrams as SVG with labeled nodes and directed edges
  - Renders wireframes as a layout sketch with sections
  - Renders annotated-code as a file header + annotation list
  - Renders decisions as a card with title, chosen option, rationale
  - Renders file-tree as an indented tree of paths
  - Caps diagram rendering at 50 nodes
  - Falls back to JSON display for unknown block types
- [x] **GREEN** — All 6 PlanView tests pass. Webchat compiles.

### 3. Register PlanView in structured view component registry

- [x] **RED** — `reeboot/webchat/src/components/__tests__/view-registry.test.tsx` written: renders `ToolCall` with `view: { type: 'plan', blocks: [...] }`, asserts `PlanView` renders (not JSON fallback). Test failed — plan type not a recognized view type.
- [x] **ACTION** — In `ToolCall.tsx`, added `view.type === 'plan'` as a recognized view type mapping to `<PlanView>`. In `src/structured-views.ts`, added `'plan'` to `VIEW_TYPES` and `{ type: 'plan'; blocks: PlanBlock[] }` variant to `ToolView` union.
- [x] **GREEN** — All 3 view-registry tests pass. Webchat compiles. `VIEW_TYPES` now includes `'plan'` as a first-class discriminant.

### 4. End-to-end: /visual-plan produces renderable output

- [x] **RED** — `reeboot/tests/visual-planning/e2e-visual-plan.test.ts` written with mock reespec directory (`fixtures/sample-request/`). No helper existed.
- [x] **ACTION** — Created `reeboot/tests/visual-planning/helpers.ts` with `buildPlanView()` that reads `brief.md` and `design.md` and extracts diagram nodes/edges, decisions, and annotated-code blocks into structured plan output.
- [x] **GREEN** — Test passes: validates `view.type === 'plan'`, non-empty blocks, at least one diagram with nodes+edges, at least one decision with title/chosen/rationale, at least one annotated-code block, and content derived from fixture files.

### 5. End-to-end: /visual-recap produces renderable output

- [x] **RED** — `reeboot/tests/visual-planning/e2e-visual-recap.test.ts` written with mock completed `tasks.md`.
- [x] **ACTION** — Created `buildRecapView()` in `reeboot/tests/visual-planning/helpers.ts` that reads `tasks.md`, extracts completed tasks and file references, outputs structured recap with `annotated-code` and `file-tree` blocks plus text summary.
- [x] **GREEN** — Test passes: validates `view.type === 'plan'`, at least one `annotated-code` block with file+annotations, at least one `file-tree` block with paths, and content referencing completion stats from fixture data.
