# /visual-recap command

## Capability: agent generates a visual recap from completed tasks

### Scenario: /visual-recap renders before/after summary
**GIVEN** completed `tasks.md` exists with checked-off tasks  
**WHEN** the user triggers `/visual-recap`  
**THEN** the agent reads the tasks file  
**AND** returns a result with `view: { type: 'plan', blocks: [...] }`  
**AND** at least one block is of type `annotated-code` showing what changed  
**AND** the `content` field includes a text summary of changes

### Scenario: /visual-recap renders file-tree of changed files
**GIVEN** the completed tasks modified specific files  
**WHEN** the user triggers `/visual-recap`  
**THEN** the result includes a `file-tree` block showing the files that were changed
