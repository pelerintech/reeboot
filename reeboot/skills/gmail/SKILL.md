---
name: gmail
description: Gmail operations via gmcli — search emails, read threads, send messages, manage labels, handle attachments. Use when working with Gmail: reading, searching, sending, or organising emails.
---

# Gmail

Wraps `gmcli` (`@mariozechner/gmcli`) for Gmail operations — search, read, send, draft, labels, attachments.

## Setup

1. Install gmcli:
   ```
   npm install -g @mariozechner/gmcli
   ```

2. Create a GCP project and enable the Gmail API:
   - Go to https://console.cloud.google.com/
   - Create a new project (or use an existing one)
   - Enable the **Gmail API** under APIs & Services → Library
   - Create **OAuth 2.0 Desktop credentials**: APIs & Services → Credentials → Create Credentials → OAuth client ID → Desktop app
   - Download the credentials JSON file

3. Configure gmcli with your credentials:
   ```
   gmcli accounts credentials ~/path/to/credentials.json
   ```

4. Add your Gmail account:
   ```
   gmcli accounts add user@gmail.com
   ```
   This opens a browser for OAuth consent. Grant the requested permissions.

5. Verify:
   ```
   gmcli accounts list
   ```

## Usage

```bash
# Search emails
gmcli user@gmail.com search "from:boss@company.com is:unread"
gmcli user@gmail.com search "subject:invoice after:2025/01/01"

# Read a thread
gmcli user@gmail.com thread <threadId>

# Send an email
gmcli user@gmail.com send \
  --to recipient@example.com \
  --subject "Hello" \
  --body "Message content here"

# Send with attachment
gmcli user@gmail.com send \
  --to recipient@example.com \
  --subject "Report" \
  --body "See attached" \
  --attach /path/to/report.pdf

# List labels
gmcli user@gmail.com labels list

# List unread in inbox
gmcli user@gmail.com search "in:inbox is:unread" --limit 10
```
