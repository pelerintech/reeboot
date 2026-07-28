# render_plan tool

## P1: Tool returns plan view with diagram block

**GIVEN** a registered `render_plan` tool
**WHEN** a tool call is made with `{ blocks: [{ type: "diagram", title: "Flow", nodes: [{ id: "a", label: "Start" }, { id: "b", label: "End" }], edges: [{ from: "a", to: "b" }] }] }`
**THEN** the tool returns `{ content: "Plan with 1 block", view: { type: "plan", blocks: [...] } }`
**AND** the WebChat renders the diagram as an SVG with nodes and directed edges

## P2: Tool returns plan view with multiple block types

**GIVEN** a registered `render_plan` tool
**WHEN** a tool call is made with blocks including diagram, decision, annotated-code, file-tree, and wireframe types
**THEN** the tool returns all blocks in the view
**AND** the WebChat renders each block type with its corresponding sub-component

## P3: Validation rejects empty blocks

**GIVEN** a registered `render_plan` tool
**WHEN** a tool call is made with `{ blocks: [] }`
**THEN** the tool returns an error result with `isError: true`
**AND** the error message indicates that at least one block is required

## P4: Validation rejects unknown block types

**GIVEN** a registered `render_plan` tool
**WHEN** a tool call is made with `{ blocks: [{ type: "unknown-type", data: "test" }] }`
**THEN** the tool accepts the block (pass-through — the PlanView component handles unknown types with JSON fallback)
**AND** the WebChat renders the unknown block as a JSON display card

## P5: Content fallback for non-webchat channels

**GIVEN** a registered `render_plan` tool
**WHEN** a tool call is made with plan blocks
**THEN** the `content` field contains a human-readable text summary of the plan
**AND** the text is suitable for display in non-webchat channels
