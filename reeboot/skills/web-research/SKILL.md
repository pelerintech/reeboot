---
name: web-research
description: Structured multi-query web research using the web-search extension. Use when researching a topic, finding current information, investigating a question, or gathering facts from the web. Run 3–5 targeted searches, synthesise findings, cite URLs.
---

# Web Research

Structured research pattern using the web-search extension. Produces a synthesis with cited sources.

## Setup

No external dependencies beyond the web-search extension being enabled in your reeboot config.

Verify the extension is active:
```
reeboot reload
```

The `web_search` tool must be available in the agent's tool list. If not, enable the web-search extension in your config:
```json
{ "extensions": ["web-search"] }
```

## Usage

Run 3–5 targeted searches for different facets of the question, then synthesise:

```
# Step 1: broaden the question into sub-queries
web_search("topic overview 2025")
web_search("topic technical details")
web_search("topic comparison alternatives")

# Step 2: check for recency
web_search("topic news March 2025")

# Step 3: synthesise
# Combine findings, note agreement/disagreement across sources, cite URLs.
```

### Best practices

- Use specific, factual queries rather than open-ended questions
- Include the year or "latest" to avoid stale results
- Read the top 3 results per query before moving on
- Cite every claim with its source URL
- If results conflict, note the discrepancy and explain which source you trust more
