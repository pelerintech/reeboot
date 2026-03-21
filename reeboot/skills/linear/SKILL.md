---
name: linear
description: Linear project management via LINEAR_API_KEY and GraphQL — create, list, update, and search issues and projects. Use when managing engineering tasks, sprint planning, or querying Linear issues.
---

# Linear

Uses `LINEAR_API_KEY` env var + curl against the Linear GraphQL API to manage issues, projects, and teams.

## Setup

1. Generate a Personal API key:
   - Go to Linear Settings → **API** → **Personal API keys**
   - Click **Create key** → give it a label → copy the key

2. Set the environment variable:
   ```
   export LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
   Add to your shell profile for persistence.

3. Verify:
   ```
   curl -X POST \
     -H "Authorization: $LINEAR_API_KEY" \
     -H "Content-Type: application/json" \
     https://api.linear.app/graphql \
     -d '{"query": "{ viewer { id name email } }"}'
   ```

## Usage

All requests go to `https://api.linear.app/graphql` with `Authorization: $LINEAR_API_KEY`.

```bash
# List your assigned issues
curl -X POST \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  https://api.linear.app/graphql \
  -d '{
    "query": "{ viewer { assignedIssues(first: 20) { nodes { id title state { name } priority } } } }"
  }'

# Search issues
curl -X POST \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  https://api.linear.app/graphql \
  -d '{
    "query": "{ issueSearch(query: \"bug login\", first: 10) { nodes { id title state { name } assignee { name } } } }"
  }'

# Create an issue
curl -X POST \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  https://api.linear.app/graphql \
  -d '{
    "query": "mutation { issueCreate(input: { teamId: \"<teamId>\", title: \"Fix login bug\", description: \"Steps to reproduce...\" }) { issue { id title } } }"
  }'

# List teams
curl -X POST \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  https://api.linear.app/graphql \
  -d '{"query": "{ teams { nodes { id name key } } }"}'

# Update issue state
curl -X POST \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  https://api.linear.app/graphql \
  -d '{
    "query": "mutation { issueUpdate(id: \"<issueId>\", input: { stateId: \"<stateId>\" }) { issue { id state { name } } } }"
  }'
```
