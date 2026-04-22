# Spec: Text Extraction

## Capability

Format-aware text extraction from supported file types: markdown/plain text (direct read), CSV (column-context preprocessing), PDF (pdf-parse). Returns plain string ready for chunking.

---

## Scenarios

### GIVEN a `.md` file with content
### WHEN `extractText` is called
### THEN the raw file content is returned as-is

---

### GIVEN a `.txt` file with content
### WHEN `extractText` is called
### THEN the raw file content is returned as-is

---

### GIVEN a `.csv` file with headers "Name,Age,City" and two data rows
### WHEN `extractText` is called
### THEN the output contains "Name: Alice, Age: 30, City: London" style entries
### AND each row is represented as a self-contained readable sentence

---

### GIVEN a `.pdf` file with extractable text
### WHEN `extractText` is called
### THEN the extracted text content is returned
### AND PDF metadata/headers are stripped

---

### GIVEN a file with an unrecognised extension (e.g. `.log`, `.yaml`)
### WHEN `extractText` is called
### THEN the file is read as plain text and returned as-is

---

### GIVEN a binary file (e.g. an image accidentally dropped in raw/)
### WHEN `extractText` is called
### THEN an error is thrown with a clear message indicating the file cannot be processed
