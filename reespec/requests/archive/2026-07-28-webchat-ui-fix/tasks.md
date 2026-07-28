# Webchat UI fix — tasks

## 1. Clear `currentAssistantIdRef` in handleSend

- [x] **RED** — S1 test exists in `Chat.test.tsx`. S2–S5 tests added to close evaluation gap.

- [x] **ACTION** — `currentAssistantIdRef.current = null` already present in `handleSend`.

  ```typescript
  const handleSend = useCallback(() => {
    if (!input.trim() || isProcessing || status !== 'connected') return;
    setMessages((prev) => prev.map((msg) => msg.streaming ? { ...msg, streaming: false } : msg));
    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', content: input.trim(), timestamp: Date.now() }]);
    setInput('');
    setIsProcessing(true);
    currentAssistantIdRef.current = null;  // ← ADD THIS
    send({ type: 'message', content: input.trim() });
  }, [input, isProcessing, status, send]);
  ```

- [x] **GREEN** — All 72 tests pass (`npx vitest run`).

---

## 2. Move user avatar to the right and align content to the left

- [x] **RED** — Tests exist in `Chat.test.tsx` (`Chat avatar layout` describe block) covering L1–L4.

- [x] **ACTION** — In `Chat.tsx`, user avatar rendered after content div; content uses `text-left`.

- [x] **GREEN** — All avatar layout assertions pass (L1–L4). All 72 tests pass (`npx vitest run`).
