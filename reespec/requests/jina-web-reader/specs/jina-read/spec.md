# Spec — jina_read tool

## Capability

When the Jina sidekick is healthy, a `jina_read` tool is registered that reads any URL
(web page incl. JS, PDF, Office doc, captioned image) and returns clean LLM-ready
content, subject to reeboot's website blocklist.

## Scenarios

### GIVEN a healthy sidekick and a normal web URL
WHEN `jina_read({ url: 'https://example.com/article' })` is called
THEN the tool GETs `{baseUrl}/https://example.com/article`
AND returns the resulting Markdown/text content

### GIVEN a healthy sidekick and `default_engine` is `auto`
WHEN `jina_read({ url })` is called without an explicit engine
THEN the request is sent without forcing an engine (container's two-tier default applies)

### GIVEN an explicit `engine: 'browser'`
WHEN `jina_read({ url, engine: 'browser' })` is called
THEN the request includes the engine header selecting headless-Chrome rendering

### GIVEN `target_selector` is provided
WHEN `jina_read({ url, target_selector: 'main article' })` is called
THEN the request includes the selector header
AND the tool returns only the matched element's content

### GIVEN `max_tokens` is provided
WHEN `jina_read({ url, max_tokens: 5000 })` is called
THEN the request includes the max-token header

### GIVEN a URL whose hostname is in the website blocklist
WHEN `jina_read({ url })` is called
THEN the tool returns a block error
AND NO HTTP request is made to the container

### GIVEN a sidekick that errors/returns non-2xx during read
WHEN `jina_read({ url })` is called
THEN the tool returns a readable error rather than throwing uncaught

### GIVEN the sidekick is NOT healthy (not registered)
WHEN the tools are inspected at load
THEN `jina_read` is not present among the registered tools
