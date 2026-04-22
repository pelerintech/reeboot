# Spec: Knowledge Tools

## Capability

Pi extension tools: `knowledge_search`, `knowledge_ingest`, `knowledge_file`, `knowledge_lint`. Registered based on `knowledge.enabled` and `knowledge.wiki.enabled`.

---

## Scenarios

### GIVEN `knowledge.enabled` is true
### WHEN the extension initialises
### THEN `knowledge_search` tool is registered
### AND `knowledge_ingest` tool is registered

---

### GIVEN `knowledge.enabled` is false
### WHEN the extension initialises
### THEN NO knowledge tools are registered

---

### GIVEN `knowledge.wiki.enabled` is true
### WHEN the extension initialises
### THEN `knowledge_file` tool is registered
### AND `knowledge_lint` tool is registered

---

### GIVEN `knowledge.wiki.enabled` is false
### WHEN the extension initialises
### THEN `knowledge_file` is NOT registered
### AND `knowledge_lint` is NOT registered

---

### GIVEN an ingested corpus
### WHEN the agent calls `knowledge_search(query="contractual obligations", limit=3)`
### THEN at most 3 results are returned
### AND each result includes filename, source_tier, confidence, and content excerpt

---

### GIVEN a file path in raw/owner/
### WHEN the agent calls `knowledge_ingest(filePath="raw/owner/contract.pdf")`
### THEN the ingest pipeline runs for that file
### AND a success result is returned with chunk_count and confidence

---

### GIVEN wiki is enabled
### WHEN the agent calls `knowledge_file(content="...", filename="moe-routing.md", pageType="comparison")`
### THEN a new file is created at `wiki/comparisons/moe-routing.md`
### AND a `wiki_pages` row is inserted with source_tier='wiki-synthesis', confidence='low'

---

### GIVEN wiki is enabled and wiki pages exist
### WHEN the agent calls `knowledge_lint()`
### THEN a structured lint report is returned
### AND the report includes: contradictions, orphan pages, missing concept pages, stale claims

---

### GIVEN `knowledge.wiki.enabled` is true
### WHEN `before_agent_start` fires
### THEN a wiki schema block is injected into the system prompt
### AND the block describes wiki structure, workflows, and citation rules
