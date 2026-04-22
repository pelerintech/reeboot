# Spec: Knowledge Config

## Capability

Knowledge feature configuration in `config.json`. Knowledge is opt-in (`enabled: false` by default). Wiki is always `false` by default.

---

## Scenarios

### GIVEN config.json has no `knowledge` key
### WHEN config is parsed
### THEN knowledge defaults are applied: enabled=false, embeddingModel="nomic-ai/nomic-embed-text-v1.5", dimensions=768, chunkSize=512, chunkOverlap=64, wiki.enabled=false, wiki.lint.schedule="0 9 * * 1"

---

### GIVEN config.json sets `knowledge.enabled: true`
### WHEN the extension initialises
### THEN raw/ directories are created if absent
### AND sqlite-vec extension is loaded
### AND knowledge schema migration runs
### AND file watcher starts on raw/

---

### GIVEN config.json sets `knowledge.enabled: false`
### WHEN the extension initialises
### THEN no knowledge tools are registered
### AND no file watcher is started

---

### GIVEN config.json sets `knowledge.wiki.enabled: true`
### WHEN the extension initialises
### THEN wiki/ directory structure is created if absent
### AND wiki index.md and log.md are initialised if absent
### AND `knowledge_file` and `knowledge_lint` tools are registered
### AND wiki schema block is injected at session start

---

### GIVEN config.json sets `knowledge.chunkSize: 256, knowledge.chunkOverlap: 32`
### WHEN a document is ingested
### THEN chunks are produced using chunkSize=256 and overlap=32

---

### GIVEN config.json sets `knowledge.dimensions: 512`
### WHEN embeddings are generated
### THEN each embedding is a Float32Array of length 512 (Matryoshka truncation applied)
