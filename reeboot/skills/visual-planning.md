# Visual Planning

Commands for generating structured visual plans and recaps in the reespec workflow.

## Commands

### `/visual-plan`

Reads a reespec `brief.md` and `design.md`, then generates a structured visual plan.

**Instructions:**
1. Read `reespec/requests/<name>/brief.md` and `reespec/requests/<name>/design.md`
2. Extract architecture, decisions, and design approach
3. Call the `render_plan` tool with the extracted blocks (see block types below)
4. Always set a descriptive text in the `title` field so the LLM sees context in the response

### `/visual-recap`

Reads completed `tasks.md` and generates a before/after visual summary.

**Instructions:**
1. Read `reespec/requests/<name>/tasks.md`
2. Identify completed tasks and what changed
3. Call the `render_plan` tool with structured blocks showing the changes (see block types below)
4. Always set a descriptive text in the `title` field so the LLM sees context in the response

## Block Types

### diagram

Architecture flow chart with labeled nodes and directed edges.

```json
{
  "type": "diagram",
  "title": "System Architecture",
  "nodes": [
    { "id": "user", "label": "User" },
    { "id": "api", "label": "API Server" },
    { "id": "db", "label": "Database" }
  ],
  "edges": [
    { "from": "user", "to": "api", "label": "HTTP" },
    { "from": "api", "to": "db", "label": "SQL" }
  ]
}
```

### wireframe

Simple UI layout sketch with named sections.

```json
{
  "type": "wireframe",
  "title": "Settings Page",
  "sections": [
    { "name": "Header", "type": "header", "content": "Navigation bar" },
    { "name": "Main", "type": "content", "content": "Settings form" },
    { "name": "Footer", "type": "footer", "content": "Save button" }
  ]
}
```

### annotated-code

Source file with per-line annotations showing changes.

```json
{
  "type": "annotated-code",
  "file": "src/server.ts",
  "language": "typescript",
  "annotations": [
    { "line": 12, "text": "Added validation middleware", "change": "add" },
    { "line": 45, "text": "Removed deprecated handler", "change": "remove" }
  ]
}
```

### decision

Design decision with options, chosen path, and rationale.

```json
{
  "type": "decision",
  "title": "Database choice",
  "options": ["SQLite", "Postgres", "MySQL"],
  "chosen": "SQLite",
  "rationale": "Single-user local deployment, zero infrastructure",
  "rejected": ["Postgres", "MySQL"]
}
```

### file-tree

Project file structure with optional notes.

```json
{
  "type": "file-tree",
  "title": "Changed files",
  "paths": [
    { "path": "src/server.ts", "note": "Added route handler" },
    { "path": "src/config.ts", "note": "Updated defaults" }
  ]
}
```

## Tool Usage

Call the `render_plan` tool with the extracted blocks. The tool accepts:
- `title` (optional): A summary label for the plan
- `blocks` (required): Array of block objects using the types above

The tool returns formatted content for all channels and a structured view for WebChat.
