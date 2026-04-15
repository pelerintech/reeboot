# Spec: Chunking and Embedding

## Capability

Sliding-window text chunker with overlap, and a singleton embedding model wrapper (nomic-embed-text-v1.5) that prepends task instruction prefixes before embedding.

---

## Scenarios

### GIVEN a text of 1000 characters and chunkSize=512, overlap=64
### WHEN `chunk` is called
### THEN multiple overlapping chunks are returned
### AND each chunk is at most chunkSize characters
### AND adjacent chunks share overlap characters
### AND no chunk is empty

---

### GIVEN a text shorter than chunkSize
### WHEN `chunk` is called
### THEN exactly one chunk is returned containing the full text

---

### GIVEN an empty string
### WHEN `chunk` is called
### THEN an empty array is returned

---

### GIVEN a list of text strings for corpus indexing
### WHEN `embed(texts, 'search_document')` is called
### THEN each text is prepended with "search_document: " before embedding
### AND the result is an array of Float32Array of length 768 (default dimensions)
### AND the array length matches the input array length

---

### GIVEN a query string
### WHEN `embedOne(query, 'search_query')` is called
### THEN the text is prepended with "search_query: " before embedding
### AND a single Float32Array of length 768 is returned

---

### GIVEN the embedder has been called once (model loaded)
### WHEN `embedOne` is called again
### THEN the model is NOT re-downloaded or re-initialised (singleton reuse)
