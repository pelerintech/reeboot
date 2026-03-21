---
name: sqlite
description: SQLite database operations via sqlite3 CLI and DATABASE_PATH — run queries, inspect schemas, read and write data. Use when working with a SQLite database file.
---

# SQLite

Wraps the `sqlite3` CLI for SQLite database operations. Uses the `DATABASE_PATH` environment variable or an explicit file path.

## Setup

1. Install sqlite3 (usually pre-installed on macOS and most Linux distros):
   ```bash
   # macOS — check first:
   sqlite3 --version

   # If not installed:
   brew install sqlite

   # Ubuntu/Debian:
   apt-get install sqlite3
   ```

2. Set the `DATABASE_PATH` environment variable (optional but recommended):
   ```bash
   export DATABASE_PATH=/path/to/your/database.db
   ```
   Add to your shell profile for persistence. Or pass the path directly in each command.

3. Verify:
   ```bash
   sqlite3 "$DATABASE_PATH" ".tables"
   # or:
   sqlite3 /path/to/database.db ".tables"
   ```

## Usage

```bash
# List all tables
sqlite3 "$DATABASE_PATH" ".tables"

# Show schema for a table
sqlite3 "$DATABASE_PATH" ".schema users"

# Show full schema
sqlite3 "$DATABASE_PATH" ".schema"

# Run a query
sqlite3 "$DATABASE_PATH" "SELECT * FROM users LIMIT 10;"

# Count rows
sqlite3 "$DATABASE_PATH" "SELECT COUNT(*) FROM orders WHERE status = 'pending';"

# Insert data
sqlite3 "$DATABASE_PATH" "INSERT INTO logs (message, created_at) VALUES ('test', datetime('now'));"

# Update data
sqlite3 "$DATABASE_PATH" "UPDATE users SET active = 1 WHERE email = 'user@example.com';"

# Delete data
sqlite3 "$DATABASE_PATH" "DELETE FROM sessions WHERE expires_at < datetime('now');"

# Run a SQL file
sqlite3 "$DATABASE_PATH" < /path/to/migration.sql

# Export to CSV
sqlite3 -csv "$DATABASE_PATH" "SELECT * FROM users;" > users.csv

# Show database info
sqlite3 "$DATABASE_PATH" ".dbinfo"

# Check table info (columns, types)
sqlite3 "$DATABASE_PATH" "PRAGMA table_info(users);"

# Interactive mode
sqlite3 "$DATABASE_PATH"
```

### Tips

- Use `LIMIT` on large tables to avoid returning too many rows
- Use `.headers on` and `.mode column` in interactive mode for readable output
- SQLite files can be inspected directly with `ls -lh "$DATABASE_PATH"` to check size
- Use `PRAGMA integrity_check;` to verify database health
