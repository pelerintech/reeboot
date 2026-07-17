# Spec — conversation-history-api

`GET /api/contexts/:id/messages` returns a context's persisted messages for UI read-back.

## S1 — returns persisted messages in chronological order
- **GIVEN** the `messages` table contains three rows for `context_id = 'main'` inserted in order
  (user "hello", assistant "hi", user "bye")
- **WHEN** a client sends `GET /api/contexts/main/messages`
- **THEN** the response is `200` and the JSON body is an array of exactly those three objects, each
  with `role`, `content`, `created_at`, in ascending (oldest-first) order.

## S2 — empty context returns empty array
- **GIVEN** a valid context `main` with no rows in `messages`
- **WHEN** a client sends `GET /api/contexts/main/messages`
- **THEN** the response is `200` with body `[]`.

## S3 — unknown context returns 404
- **GIVEN** no context with id `does-not-exist`
- **WHEN** a client sends `GET /api/contexts/does-not-exist/messages`
- **THEN** the response is `404` with body `{ "error": "Context not found" }`.

## S4 — limit returns the most recent N in chronological order
- **GIVEN** the `messages` table has 5 rows for `main` (m1..m5 in insertion order)
- **WHEN** a client sends `GET /api/contexts/main/messages?limit=2`
- **THEN** the response contains exactly 2 items, and they are the **most recent** two (m4, m5) in
  ascending order (m4 before m5).

## S5 — only the requested context's messages are returned
- **GIVEN** `messages` has rows for both `main` and another context `work`
- **WHEN** a client sends `GET /api/contexts/main/messages`
- **THEN** every returned row belongs to `main`; no `work` rows appear.
