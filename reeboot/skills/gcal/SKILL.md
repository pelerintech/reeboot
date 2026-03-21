---
name: gcal
description: Google Calendar operations via gccli — list events, create meetings, update or delete events, check free/busy. Use when managing calendar events, scheduling meetings, or checking availability.
---

# Google Calendar

Wraps `gccli` (`@mariozechner/gccli`) for Google Calendar operations — list, create, update, delete events, and free/busy queries.

## Setup

1. Install gccli:
   ```
   npm install -g @mariozechner/gccli
   ```

2. Use the same GCP project as the Gmail skill (or create a new one):
   - Enable the **Google Calendar API** under APIs & Services → Library
   - Use the same OAuth 2.0 Desktop credentials JSON (or create new ones)

3. Configure gccli with your credentials:
   ```
   gccli accounts credentials ~/path/to/credentials.json
   ```

4. Add your Google account:
   ```
   gccli accounts add user@gmail.com
   ```
   Follow the browser OAuth consent flow.

5. Verify:
   ```
   gccli accounts list
   gccli user@gmail.com list --days 1
   ```

## Usage

```bash
# List upcoming events (next 7 days)
gccli user@gmail.com list --days 7

# List events in a date range
gccli user@gmail.com list --from 2026-03-21 --to 2026-03-28

# Create an event
gccli user@gmail.com create \
  --title "Team Standup" \
  --start "2026-03-21T09:00" \
  --end "2026-03-21T09:30" \
  --description "Daily sync"

# Create an all-day event
gccli user@gmail.com create \
  --title "Conference" \
  --date "2026-03-21"

# Update an event
gccli user@gmail.com update <eventId> --title "New Title"

# Delete an event
gccli user@gmail.com delete <eventId>

# Check free/busy
gccli user@gmail.com freebusy \
  --from "2026-03-21T08:00" \
  --to "2026-03-21T18:00"
```
