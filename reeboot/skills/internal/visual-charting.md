# Visual Charting & Interactive Views

Guidelines for using `render_chart`, `render_form`, and `render_confirm` tools to produce rich visual and interactive content.

## render_chart — When to Use

Call the `render_chart` tool when the user asks for:
- A chart, graph, bar chart, line chart, or visualization of numeric data
- Comparing values across categories (e.g., "show sales by month")
- Visualizing trends over time (e.g., "plot revenue for Q1")
- Any data that has labels and numeric values that would benefit from a visual representation

**Input:**
- `labels` (string[]): X-axis labels
- `values` (number[]): Y-axis values (must match labels length)
- `kind` ("bar" | "line"): Chart type
- `title` (optional): Chart title

**Examples:**
- User: "Show me a bar chart of monthly sales" → call `render_chart` with labels=["Jan","Feb","Mar"], values=[100,150,200], kind="bar"
- User: "Plot the trend of signups over the last 5 days" → call `render_chart` with labels=["Mon","Tue","Wed","Thu","Fri"], values=[10,25,18,30,45], kind="line"

## render_form — When to Use

Call the `render_form` tool when you need to collect structured information from the user with multiple fields at once. Use this instead of asking one question at a time.

**Use cases:**
- Collecting company details (name, type, employee count)
- Gathering contact information (name, email, phone)
- Any scenario where you need 2+ related pieces of information

**Input:**
- `fields` (FormField[]): Array of field definitions
  - Each field has: `name` (identifier), `label` (display label), `type` ("text"|"select"|"number")
  - For `select` fields, include `options` array
- `title` (optional): Form title

**Examples:**
- "I need your company details" → call `render_form` with fields for company name (text), company type (select: Tech/Finance), employees (number)
- "Tell me about yourself" → call `render_form` with fields for name (text), email (text), age (number)

## render_confirm — When to Use

Call the `render_confirm` tool before performing a destructive or consequential action. This creates a safety gate that requires explicit user approval.

**Use cases:**
- Before cancelling an order, deleting data, or making irreversible changes
- Before sending a message on behalf of the user
- Before executing a high-cost or high-impact operation
- Any action where the user should explicitly approve before proceeding

**Input:**
- `title` (string): Short confirmation question
- `message` (string): Detailed explanation of what will happen
- `confirmLabel` (optional): Custom approve button text
- `cancelLabel` (optional): Custom deny button text

**Examples:**
- User wants to cancel an order → call `render_confirm` with title="Cancel order?", message="Order #123 will be cancelled and refunded"
- Before deleting a file → call `render_confirm` with title="Delete file?", message="config.json will be permanently removed"
