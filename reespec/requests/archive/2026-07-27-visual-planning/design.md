# Visual planning — design

## Overview

A skill file + a `PlanView` React component that renders structured plan blocks (diagrams, wireframes, annotated code, decisions, file trees) inline in the WebChat. Uses the structured tool views system (request `structured-tool-views`) for rendering. No separate rendering engine — the LLM outputs structured data, the component renders it as SVG inline.

## Relationship to structured-tool-views

This request depends on `structured-tool-views` for its rendering infrastructure. The plan blocks are implemented as a new `view` discriminant type: `view: { type: 'plan', blocks: [...] }`. The `PlanView` component is registered in the same component registry as `DataTable` and `DataChart`.

If `structured-tool-views` is not yet implemented, this request's rendering falls back to text (the LLM describes the plan in prose). The skill file can be authored independently.

## Block types

Inspired by Agent-Native's Plans template. Each block has a `type` discriminant and typed data:

### diagram
```ts
{ type: 'diagram', nodes: { id: string; label: string; x?: number; y?: number }[], edges: { from: string; to: string; label?: string }[] }
```
Renders as an SVG flow chart with labeled nodes and directed edges.

### wireframe
```ts
{ type: 'wireframe', title: string; sections: { name: string; type: 'header' | 'content' | 'sidebar' | 'footer'; content: string }[] }
```
Renders as a simple UI layout sketch.

### annotated-code
```ts
{ type: 'annotated-code', file: string; language: string; annotations: { line: number; text: string; change?: 'add' | 'remove' | 'modify' }[] }
```
Renders a code file path with per-line annotations.

### decision
```ts
{ type: 'decision', title: string; options: string[]; chosen: string; rationale: string; rejected: string[] }
```
Renders as a decision card with chosen option + rationale.

### file-tree
```ts
{ type: 'file-tree', paths: { path: string; note?: string }[] }
```
Renders a tree of file paths with optional notes.

## Commands

### `/visual-plan`
Reads a reespec `brief.md` and `design.md`, generates structured plan blocks, returns them with a `view: { type: 'plan', blocks: [...] }` result.

### `/visual-recap`
Reads completed `tasks.md`, generates a before/after visual summary with annotations.

Both are implemented as:
1. A skill file (`.md`) that instructs the agent on the structured output format
2. The agent generates the structured blocks inline in its response
3. The `PlanView` component renders them

## Text fallback

For WhatsApp/Signal channels that cannot render SVG/HTML, the agent also generates a text description of the plan as part of its `content` field. The `view` field is used by WebChat for rich rendering, but the `content` text is always present for text-only channels.

## Skill file location

`reeboot/skills/visual-planning.md`

The skill instructs the agent:
- When asked for a visual plan, read the relevant reespec files
- Output structured blocks using the defined block types
- Include a text description for non-WebChat channels
- The blocks render inline in WebChat via the structured view system

## Risks

- **Block type proliferation**: Without discipline, block types multiply. Mitigation: start with the 5 types above. New types require a request.
- **Complex rendering**: Diagrams with many nodes could be slow. Mitigation: cap nodes/edges at 50. Show a "diagram too large" message beyond that.
- **LLM output quality**: The LLM must output structured data correctly. Mitigation: the skill file provides explicit examples. The PlanView component gracefully handles malformed data (shows partial rendering with an error note).
