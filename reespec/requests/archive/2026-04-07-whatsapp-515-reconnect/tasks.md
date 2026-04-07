# Tasks — whatsapp-515-reconnect

---

### 1. Test: linkWhatsAppDevice calls onSuccess after 515 restart

- [x] **RED** — Write `tests/channels/whatsapp-link.test.ts`. Mock `@whiskeysockets/baileys`
      with a factory that returns two sockets in sequence: first socket emits
      `connection: 'close'` with `lastDisconnect.error.output.statusCode = 515`;
      second socket emits `connection: 'open'`. Also test the direct-open path
      (no 515) and the timeout path. Import `linkWhatsAppDevice` from
      `@src/channels/whatsapp.js`. Run `npx vitest run tests/channels/whatsapp-link.test.ts`
      → tests fail (`linkWhatsAppDevice` does not reconnect, onSuccess never called on 515 path).
- [x] **ACTION** — Refactor `linkWhatsAppDevice` in `src/channels/whatsapp.ts`: extract an inner
      `async function connect()` that creates the socket, attaches `creds.update` and
      `connection.update` handlers, and on `connection: 'close'` checks statusCode —
      loggedOut (401) → no-op (fatal); restartRequired (515) or any other non-fatal → call
      `connect()` recursively. The `resolved` flag, `timeoutHandle`, and all callbacks
      (`onQr`, `onSuccess`, `onTimeout`) are closed over from the outer scope and shared
      across all recursive calls.
- [x] **GREEN** — Run `npx vitest run tests/channels/whatsapp-link.test.ts` → all tests pass.

---

### 2. Existing WhatsApp tests still pass

- [x] **RED** — Check: `npx vitest run tests/channels/whatsapp.test.ts` currently passes
      (baseline). Assertion: exit code 0.
- [x] **ACTION** — No change needed if Task 1 ACTION is scoped correctly. If any existing
      test breaks due to the refactor, fix `whatsapp.ts` so the public API is unchanged.
- [x] **GREEN** — Run `npx vitest run tests/channels/whatsapp.test.ts` → still passes (exit code 0).

---

### 3. Bump version to 1.3.2 and update CHANGELOG

- [x] **RED** — Check: `grep -q '"version": "1.3.2"' reeboot/package.json` → fails (still 1.3.1).
      Check: `grep -q '\[1.3.2\]' CHANGELOG.md` → fails (entry absent).
- [x] **ACTION** — Update `reeboot/package.json` version to `"1.3.2"`. Add `## [1.3.2] - 2026-03-21`
      entry at the top of the versions list in `CHANGELOG.md` with a Fixed section:
      "WhatsApp device linking hangs after QR scan — `linkWhatsAppDevice` now reconnects
      automatically on stream error 515 (restartRequired), which WhatsApp sends as a normal
      part of the post-pairing handshake."
- [x] **GREEN** — Verify:
      `grep -q '"version": "1.3.2"' reeboot/package.json` ✓
      `grep -q '\[1.3.2\]' CHANGELOG.md` ✓
      `grep -n '\[1\.' CHANGELOG.md` shows 1.3.2 on the lowest line number (newest first).
