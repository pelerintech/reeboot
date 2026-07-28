# PlanView component rendering

## Capability: PlanView renders structured plan blocks

### Scenario: PlanView renders diagram block
**GIVEN** a `PlanView` component receives a `diagram` block with 3 nodes and 2 edges  
**WHEN** the component renders  
**THEN** it displays an SVG with labeled nodes connected by directed edges

### Scenario: PlanView renders wireframe block
**GIVEN** a `PlanView` component receives a `wireframe` block with sections  
**WHEN** the component renders  
**THEN** it displays a layout sketch with section labels

### Scenario: PlanView renders annotated-code block
**GIVEN** a `PlanView` component receives an `annotated-code` block  
**WHEN** the component renders  
**THEN** it displays the file path as a header  
**AND** each annotation line with its note

### Scenario: PlanView renders decision block
**GIVEN** a `PlanView` component receives a `decision` block  
**WHEN** the component renders  
**THEN** it displays the title, chosen option, and rationale

### Scenario: PlanView renders file-tree block
**GIVEN** a `PlanView` component receives a `file-tree` block with paths  
**WHEN** the component renders  
**THEN** it displays a tree of file paths with notes

### Scenario: PlanView caps diagram complexity
**GIVEN** a `PlanView` component receives a `diagram` block with 100 nodes and 200 edges  
**WHEN** the component renders  
**THEN** it displays a capped view of the first 50 nodes  
**AND** a message "Diagram too large — showing first 50 nodes"

### Scenario: PlanView handles unknown block type gracefully
**GIVEN** a `PlanView` component receives a block with an unknown type  
**WHEN** the component renders  
**THEN** it renders a fallback card showing the block as JSON  
**AND** no error is thrown
