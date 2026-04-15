# Spec: Hybrid Search

## Capability

Hybrid search combining vector KNN (sqlite-vec) and FTS5 keyword search over the knowledge corpus. Results include source citations with tier and confidence.

---

## Scenarios

### GIVEN documents have been ingested
### WHEN `hybridSearch(query, limit=5)` is called
### THEN at most 5 results are returned
### AND each result includes: content excerpt, filename, source_tier, confidence, doc_id, chunk_index

---

### GIVEN a corpus containing "Civil Code Article 1234 states that contracts require consent"
### WHEN `hybridSearch("Article 1234")` is called
### THEN the result containing "Article 1234" is returned
### AND the citation shows the correct filename and source_tier

---

### GIVEN a corpus containing a concept related to "contractual obligations"
### WHEN `hybridSearch("obligations between parties")` is called
### THEN semantically related chunks are returned even without exact keyword match

---

### GIVEN a corpus with both template and owner documents
### WHEN `hybridSearch` returns results
### THEN each result clearly identifies its source_tier ('template' or 'owner')
### AND results from both tiers can appear together

---

### GIVEN an empty knowledge corpus
### WHEN `hybridSearch` is called
### THEN an empty array is returned with no error

---

### GIVEN vector results and FTS5 results overlap on the same chunk
### WHEN results are merged
### THEN the chunk appears only once in the final results
### AND vector score takes precedence for ranking
