---
name: gdrive
description: Google Drive operations via gdcli — list files, read documents, search, upload, and share. Use when accessing, reading, or managing files in Google Drive.
---

# Google Drive

Wraps `gdcli` (`@mariozechner/gdcli`) for Google Drive operations — list, read, search, upload, and share files.

## Setup

1. Install gdcli:
   ```
   npm install -g @mariozechner/gdcli
   ```

2. Use the same GCP project as the Gmail/Calendar skills (or create a new one):
   - Enable the **Google Drive API** under APIs & Services → Library
   - Use the same OAuth 2.0 Desktop credentials JSON

3. Configure gdcli with your credentials:
   ```
   gdcli accounts credentials ~/path/to/credentials.json
   ```

4. Add your Google account:
   ```
   gdcli accounts add user@gmail.com
   ```
   Follow the browser OAuth consent flow.

5. Verify:
   ```
   gdcli accounts list
   gdcli user@gmail.com list --limit 5
   ```

## Usage

```bash
# List files in root
gdcli user@gmail.com list --limit 20

# List files in a folder
gdcli user@gmail.com list --folder <folderId>

# Search files
gdcli user@gmail.com search "quarterly report"
gdcli user@gmail.com search "type:spreadsheet name:budget"

# Read a file (returns text content)
gdcli user@gmail.com read <fileId>

# Upload a file
gdcli user@gmail.com upload /path/to/file.pdf --name "Report Q1"

# Upload to a specific folder
gdcli user@gmail.com upload /path/to/file.pdf --folder <folderId>

# Share a file
gdcli user@gmail.com share <fileId> --email colleague@example.com --role reader

# Get file metadata
gdcli user@gmail.com info <fileId>
```
