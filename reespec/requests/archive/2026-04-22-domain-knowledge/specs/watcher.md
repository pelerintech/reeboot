# Spec: File Watcher

## Capability

fs.watch-based watcher on `raw/` directory that detects new files, deduplicates by hash against `knowledge_sources`, queues pending ingests, and pauses while the agent is processing.

---

## Scenarios

### GIVEN a KnowledgeWatcher is started on a raw/ directory
### WHEN a new `.md` file is written to `raw/owner/`
### THEN the file appears in `getPendingFiles()` after the debounce window (300ms)

---

### GIVEN a file has already been ingested (hash exists in knowledge_sources)
### WHEN the same file is written to raw/ again (same content, same hash)
### THEN it does NOT appear in `getPendingFiles()`

---

### GIVEN a file has been ingested but is then modified (new hash)
### WHEN the modified file is written to raw/
### THEN it DOES appear in `getPendingFiles()` (re-ingest required)

---

### GIVEN the watcher is running and a file is detected
### WHEN `clearPending()` is called
### THEN `getPendingFiles()` returns an empty array

---

### GIVEN a binary file (e.g. `.png`) is written to raw/
### WHEN the watcher detects it
### THEN it does NOT appear in `getPendingFiles()` (binary files skipped)

---

### GIVEN a file in an ignored directory (e.g. `.git/` inside raw/)
### WHEN the watcher detects a change
### THEN it does NOT appear in `getPendingFiles()`

---

### GIVEN the watcher is running
### WHEN `stop()` is called
### THEN no further file events are processed
### AND `getPendingFiles()` returns an empty array
