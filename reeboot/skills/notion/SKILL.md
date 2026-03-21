---
name: notion
description: Notion workspace operations via NOTION_API_KEY and curl — search pages, read databases, create/update blocks and pages. Use when accessing or modifying content in a Notion workspace.
---

# Notion

Uses `NOTION_API_KEY` env var + curl against the Notion REST API to manage pages, databases, and blocks.

## Setup

1. Create a Notion internal integration:
   - Go to https://www.notion.so/my-integrations
   - Click **New integration**
   - Give it a name (e.g., "reeboot-agent")
   - Select the workspace
   - Copy the **Internal Integration Token** (starts with `secret_`)

2. Set the environment variable:
   ```
   export NOTION_API_KEY=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
   Add to your shell profile (`~/.zshrc` or `~/.bashrc`) for persistence.

3. Share pages/databases with the integration:
   - Open any Notion page you want the agent to access
   - Click **Share** (top right) → **Invite** → search for your integration name → **Invite**

4. Verify:
   ```
   curl -H "Authorization: Bearer $NOTION_API_KEY" \
        -H "Notion-Version: 2022-06-28" \
        https://api.notion.com/v1/users/me
   ```

## Usage

```bash
# Search across workspace
curl -X POST \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  https://api.notion.com/v1/search \
  -d '{"query": "project roadmap", "filter": {"value": "page", "property": "object"}}'

# List databases
curl -X POST \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  https://api.notion.com/v1/search \
  -d '{"filter": {"value": "database", "property": "object"}}'

# Query a database
curl -X POST \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/databases/<database_id>/query" \
  -d '{"filter": {"property": "Status", "select": {"equals": "In Progress"}}}'

# Get a page
curl -H "Authorization: Bearer $NOTION_API_KEY" \
     -H "Notion-Version: 2022-06-28" \
     "https://api.notion.com/v1/pages/<page_id>"

# Get page blocks (content)
curl -H "Authorization: Bearer $NOTION_API_KEY" \
     -H "Notion-Version: 2022-06-28" \
     "https://api.notion.com/v1/blocks/<page_id>/children"

# Create a page
curl -X POST \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  https://api.notion.com/v1/pages \
  -d '{
    "parent": {"database_id": "<database_id>"},
    "properties": {
      "Name": {"title": [{"text": {"content": "New page"}}]}
    }
  }'
```
