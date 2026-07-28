# Widget components — rendering in WebChat

## Capability: DataTable renders columns + rows

### Scenario: DataTable renders with headers and rows
**GIVEN** a `DataTable` component receives `{ columns: ['Name', 'Email'], rows: [{ Name: 'Alice', Email: 'a@b.com' }] }`  
**WHEN** the component renders  
**THEN** it displays a table with column headers "Name" and "Email"  
**AND** a row with values "Alice" and "a@b.com"

### Scenario: DataTable renders empty state
**GIVEN** a `DataTable` component receives `{ columns: ['Name'], rows: [] }`  
**WHEN** the component renders  
**THEN** it displays column headers  
**AND** an empty state message "No rows"

### Scenario: DataTable caps at 100 rows
**GIVEN** a `DataTable` component receives 500 rows  
**WHEN** the component renders  
**THEN** it displays the first 100 rows  
**AND** a "Show 400 more" button

## Capability: DataChart renders SVG chart

### Scenario: DataChart renders bar chart
**GIVEN** a `DataChart` component receives `{ labels: ['A', 'B'], values: [10, 20], kind: 'bar' }`  
**WHEN** the component renders  
**THEN** it displays an SVG bar chart with labeled axes

### Scenario: DataChart renders line chart
**GIVEN** a `DataChart` component receives `{ labels: ['A', 'B'], values: [10, 20], kind: 'line' }`  
**WHEN** the component renders  
**THEN** it displays an SVG line chart with labeled axes

### Scenario: DataChart renders empty state
**GIVEN** a `DataChart` component receives `{ labels: [], values: [], kind: 'bar' }`  
**WHEN** the component renders  
**THEN** it displays "No data to display"
