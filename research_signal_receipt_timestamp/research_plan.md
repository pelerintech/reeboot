# Research Plan: Signal CLI REST API — receipt timestamp format

## Main Research Question
Does the signal-cli-rest-api `POST /v1/receipts/{number}` endpoint expect the
`timestamp` field in **milliseconds** or **seconds**?

## Subtopics to Investigate
1. **signal-cli-rest-api receipts endpoint spec**: What the OpenAPI/Swagger spec or
   source code says about the `timestamp` field type and semantics.
2. **signal-cli native timestamp format**: What format signal-cli itself uses for
   message timestamps internally (ms vs s), as the REST API wraps signal-cli.

## Expected Information per Subtopic
- Subtopic 1: OpenAPI spec field description, example values, or source code showing
  how the timestamp is consumed.
- Subtopic 2: signal-cli documentation, source code, or issues discussing timestamp
  format for read receipts.

## Synthesis Plan
Compare both findings. If the REST API spec is explicit, that wins. If ambiguous,
fall back to signal-cli internals (since the REST API is a thin wrapper).
