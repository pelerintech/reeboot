---
name: postgres
description: PostgreSQL database operations via psql CLI and DATABASE_URL — run queries, inspect schemas, insert data, manage tables. Use when working with a PostgreSQL database.
---

# PostgreSQL

Wraps the `psql` CLI for PostgreSQL database operations. Connects via the `DATABASE_URL` environment variable.

## Setup

1. Install psql:
   ```
   brew install postgresql    # macOS (installs psql client only)
   # or on Ubuntu/Debian: apt-get install postgresql-client
   ```

2. Set the `DATABASE_URL` environment variable:
   ```
   export DATABASE_URL=postgresql://user:password@host:5432/dbname
   ```
   Examples:
   ```
   export DATABASE_URL=postgresql://postgres:secret@localhost:5432/myapp
   export DATABASE_URL=postgresql://myuser:mypass@db.example.com:5432/production
   ```
   Add to your shell profile for persistence.

3. Verify connection:
   ```
   psql "$DATABASE_URL" -c "SELECT version();"
   ```

## Usage

```bash
# Run a query
psql "$DATABASE_URL" -c "SELECT * FROM users LIMIT 10;"

# Inspect tables
psql "$DATABASE_URL" -c "\dt"

# Describe a table schema
psql "$DATABASE_URL" -c "\d users"

# Count rows
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM orders WHERE status = 'pending';"

# Insert data
psql "$DATABASE_URL" -c "INSERT INTO logs (message, created_at) VALUES ('test', NOW());"

# Update data
psql "$DATABASE_URL" -c "UPDATE users SET active = true WHERE email = 'user@example.com';"

# Run a SQL file
psql "$DATABASE_URL" -f /path/to/migration.sql

# Interactive mode (use with caution)
psql "$DATABASE_URL"

# Export query result to CSV
psql "$DATABASE_URL" -c "COPY (SELECT * FROM users) TO STDOUT WITH CSV HEADER" > users.csv

# List databases
psql "$DATABASE_URL" -c "\l"

# Check active connections
psql "$DATABASE_URL" -c "SELECT pid, usename, application_name, state FROM pg_stat_activity;"
```

### Tips

- Always `LIMIT` queries on large tables to avoid returning millions of rows
- Use `-t` flag for tuple-only output (no headers) when parsing output programmatically
- Use `--no-password` with `DATABASE_URL` to avoid password prompts
