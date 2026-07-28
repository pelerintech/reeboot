## Evaluation — 2026-07-27 20:05

### message-ordering
verdict:  ⚠️ PARTIAL
reason:   specs/message-ordering.md defines five scenarios (S1–S5). S1 is
          implemented in `reeboot/webchat/src/pages/Chat.tsx` (`handleSend`
          sets `currentAssistantIdRef.current = null`) and verified by
          `Chat.test.tsx` ("creates a new assistant message for each turn (S1)"),
          which passes. S2–S5 are implemented in code logic (tool_call_start
          targets the ref; message_end deliberately does not clear the ref; error
          and cancelled handlers both null the ref) but have NO corresponding
          tests — `Chat.test.tsx` contains no tool_call, trailing-tool_call_end,
          error-ref-reset, or cancelled-ref-reset scenario. The "S2/S3/S4" labels
          in the "Chat history hydration" describe block belong to a different
          (archived) hydration spec, not this request's message-ordering spec.
focus:    reeboot/webchat/src/pages/__tests__/Chat.test.tsx — add tests for S2
          (second-turn tool_call attaches to assistant-2), S3 (tool_call_end
          after message_end updates the same turn's message), S4 (error resets
          ref so next text_delta creates a new message), S5 (cancelled resets
          ref likewise). The subtle ordering edge cases are exactly what the spec
          exists to lock down; they are currently unverified.

### user-avatar-placement
verdict:  ✅ SATISFIED
reason:   specs/user-avatar-placement.md defines L1–L4. `Chat.tsx` renders the
          assistant avatar (bg-zinc-900) before the content div and the user
          avatar (bg-blue-600) after it; the content wrapper uses
          `className="flex-1 text-left"`; error-role messages render no avatar
          block. `Chat.test.tsx` covers all four: "renders user avatar on the
          right and assistant avatar on the left (L1, L2)" also asserts
          `text-left` / not `text-right` (L3), and "shows no avatar for error
          messages (L4)" asserts the error row has no bg-zinc-900 or bg-blue-600
          child. All 68 tests pass (`npx vitest run`).

## Triage

✅ Safe to skip:   user-avatar-placement
⚠️  Worth a look:  message-ordering — S1 implemented + tested; S2–S5 implemented in code but lacking automated tests for the spec's GIVEN/WHEN/THEN scenarios (tool-call targeting, trailing tool_call_end, error/cancelled ref reset)
❓  Human call:    none — contract is precise

---
