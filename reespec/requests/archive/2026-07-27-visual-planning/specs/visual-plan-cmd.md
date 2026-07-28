# /visual-plan command

## Capability: agent generates a visual plan from reespec files

### Scenario: /visual-plan renders diagram blocks
**GIVEN** reespec `brief.md` and `design.md` exist with architecture content  
**WHEN** the user triggers `/visual-plan`  
**THEN** the agent reads both files  
**AND** returns a result with `view: { type: 'plan', blocks: [...] }`  
**AND** at least one block is of type `diagram` with nodes and edges  
**AND** the `content` field includes a text description of the plan

### Scenario: /visual-plan renders decision blocks
**GIVEN** the `design.md` contains design decisions  
**WHEN** the user triggers `/visual-plan`  
**THEN** the result includes at least one `decision` block with title, chosen option, and rationale

### Scenario: /visual-plan renders annotated-code blocks
**GIVEN** the `design.md` references specific files and changes  
**WHEN** the user triggers `/visual-plan`  
**THEN** the result includes at least one `annotated-code` block with file path and line annotations

### Scenario: /visual-plan works without structured-tool-views
**GIVEN** the structured tool views system is not available  
**WHEN** the user triggers `/visual-plan`  
**THEN** the agent still outputs a text description in the `content` field  
**AND** the plan is readable as plain text
