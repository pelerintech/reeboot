---
name: files
description: Local filesystem operations — read files, list directories, search with find/grep, write files. Use when reading, writing, searching, or managing local files and directories.
---

# Files

Local filesystem operations using standard shell tools. No external dependencies beyond bash.

## Setup

No installation required — all tools (`cat`, `ls`, `find`, `grep`, `head`, `tail`) are built into macOS and Linux.

**Protected paths**: reeboot's protected-paths extension blocks access to sensitive directories (e.g., `~/.ssh`, `~/.reeboot/credentials`). The agent will refuse to read or modify files in these paths.

Check which paths are protected:
```bash
# The protected-paths extension documents blocked directories
# Default blocked: ~/.ssh, ~/.gnupg, /etc/passwd, /etc/shadow, ~/.reeboot/credentials
```

## Usage

### Reading files

```bash
# Read an entire file
cat /path/to/file.txt

# Read first N lines
head -n 50 /path/to/file.txt

# Read last N lines
tail -n 100 /path/to/file.log

# Read a specific range of lines
sed -n '10,30p' /path/to/file.txt
```

### Listing directories

```bash
# List with details
ls -la /path/to/directory

# List recursively (shallow)
ls -la /path/to/directory/

# Tree view (if available)
find /path/to/directory -maxdepth 2 -print | sed 's|[^/]*/|  |g'
```

### Searching

```bash
# Search file contents
grep -r "pattern" /path/to/directory
grep -r "TODO" . --include="*.ts"
grep -n "function auth" src/auth.ts

# Find files by name
find /path -name "*.json" -type f
find . -name "*.log" -mtime -7   # modified in last 7 days

# Find and grep
find . -name "*.ts" | xargs grep "import.*config"
```

### Writing files

```bash
# Write (overwrite) a file
echo "content" > /path/to/file.txt
cat > /path/to/file.txt << 'HEREDOC'
multi-line
content here
HEREDOC

# Append to a file
echo "new line" >> /path/to/file.log

# Copy a file
cp /source/file.txt /dest/file.txt

# Move/rename a file
mv /old/path.txt /new/path.txt
```

### Safe practices

- Always `head` or `wc -l` a file before `cat` if you don't know its size
- Use `find` with `-maxdepth` to avoid traversing huge directory trees
- Prefer `cat` over editors for reading; use redirect operators for writing
- Check file size first: `ls -lh /path/to/file`
