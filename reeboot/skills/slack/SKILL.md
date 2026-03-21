---
name: slack
description: Slack workspace operations via SLACK_BOT_TOKEN and curl — send messages, list channels, post to threads, upload files. Use when sending Slack messages, reading channels, or interacting with a Slack workspace.
---

# Slack

Uses `SLACK_BOT_TOKEN` env var + curl against the Slack Web API to send messages, list channels, reply to threads, and upload files.

## Setup

1. Create a Slack App at https://api.slack.com/apps:
   - Click **Create New App** → **From scratch**
   - Give it a name and select your workspace

2. Configure Bot Token Scopes under **OAuth & Permissions** → **Bot Token Scopes**:
   - `channels:read` — list public channels
   - `chat:write` — post messages
   - `files:write` — upload files
   - `groups:read` — list private channels (optional)
   - `im:read` / `im:write` — direct messages (optional)

3. Install to workspace:
   - Click **Install to Workspace** → **Allow**
   - Copy the **Bot User OAuth Token** (starts with `xoxb-`)

4. Set the environment variable:
   ```
   export SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx
   ```
   Add to your shell profile for persistence.

5. Invite the bot to channels:
   ```
   /invite @your-bot-name
   ```

6. Verify:
   ```
   curl -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
        https://slack.com/api/auth.test
   ```

## Usage

```bash
# List channels
curl -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
     "https://slack.com/api/conversations.list?limit=50"

# Post a message
curl -X POST \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  https://slack.com/api/chat.postMessage \
  -d '{"channel": "#general", "text": "Hello from reeboot!"}'

# Reply in a thread
curl -X POST \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  https://slack.com/api/chat.postMessage \
  -d '{"channel": "#general", "text": "Reply", "thread_ts": "<parent_ts>"}'

# Get channel history
curl -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
     "https://slack.com/api/conversations.history?channel=<channel_id>&limit=20"

# Upload a file
curl -F "file=@/path/to/file.pdf" \
     -F "channels=<channel_id>" \
     -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
     https://slack.com/api/files.upload
```
