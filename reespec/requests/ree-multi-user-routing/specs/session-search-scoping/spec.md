# Spec — session-search-scoping (verification only)

`session_search` in ree is scoped to the current chat, so a customer cannot search another customer's
history. No code change expected — this verifies and locks the existing `WHERE m.chat_id = ?` scope.

## S1 — search returns only the current chat's messages
- **GIVEN** chat A and chat B each with history, where B contains the term "refund"
- **WHEN** a `session_search` for "refund" is issued from within chat A (adapter bound to A)
- **THEN** results contain only A's messages; none of B's rows are returned.

## S2 — current chat id comes from the bound adapter
- **GIVEN** an adapter bound to chat `cust-42`
- **WHEN** `getCurrentChatId()` is called
- **THEN** it returns `cust-42` (a chat cannot report another chat's id).
