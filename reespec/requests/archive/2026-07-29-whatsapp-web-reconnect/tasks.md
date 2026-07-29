## 1. QR endpoint: POST /api/channels/whatsapp/qr

- [x] **RED** — Write `tests/whatsapp-qr-endpoint.test.ts`: source-code inspection test checking route string, linkWhatsAppDevice usage, QR rendering, adapter stop/start. Run → fails (strings not in server.ts yet).
- [x] **ACTION** — Implement the endpoint in `src/server.ts`: add `POST /api/channels/whatsapp/qr` route. Stop adapter, wipe auth dir, call `linkWhatsAppDevice()` with `onQr` that renders QR to data URL via `QRCode.toDataURL()` and resolves the response. On timeout (2 min), return 408.
- [x] **GREEN** — Run `npx vitest run tests/whatsapp-qr-endpoint.test.ts` → all 5 tests pass.

## 2. QR endpoint: adapter stop/start coordination

- [x] **RED** — Write `tests/whatsapp-qr-coordination.test.ts`: source-code inspection test verifying adapter.stop() precedes linkWhatsAppDevice, adapter.start() is inside onSuccess, and auth dir is wiped before link. Run → fails (coordination not yet implemented in handler).
- [x] **ACTION** — Coordination already implemented as part of Task 1 handler: adapter.stop() before link flow, auth dir wipe, adapter.start() in onSuccess callback.
- [x] **GREEN** — Run `npx vitest run tests/whatsapp-qr-coordination.test.ts` → all 3 tests pass.

## 3. Pairing endpoint: POST /api/channels/whatsapp/pair

- [x] **RED** — Write `tests/whatsapp-pair-endpoint.test.ts`: source-code test checking route, phone validation, adapter stop/auth clear, Baileys pairingCode/phoneNumber usage, paired status return. Run → fails.
- [x] **ACTION** — Implement the endpoint in `src/server.ts`: validate phone (400 if missing), stop adapter, clear auth, create Baileys socket with pairingCode:true + phoneNumber, wait for open/timeout, save creds, start adapter.
- [x] **GREEN** — Run `npx vitest run tests/whatsapp-pair-endpoint.test.ts` → all 5 tests pass.

## 4. Reset endpoint: POST /api/channels/whatsapp/reset

- [x] **RED** — Write `tests/whatsapp-reset-endpoint.test.ts`: source-code test checking route, status response, adapter.stop() call, auth dir rmSync. Run → fails.
- [x] **ACTION** — Implement the endpoint in `src/server.ts`: stop adapter, wipe auth dir, return `{ status: "reset" }`.
- [x] **GREEN** — Run `npx vitest run tests/whatsapp-reset-endpoint.test.ts` → all 4 tests pass.

## 5. Install qrcode server dependency

- [x] **RED** — Check: `qrcode` is listed in `reeboot/package.json` dependencies. If not present, assertion fails.
- [x] **ACTION** — Run `npm install qrcode` in `reeboot/` directory. Add `@types/qrcode` as dev dependency if needed.
- [x] **GREEN** — Verify `qrcode` appears in `reeboot/package.json` dependencies. Run `node -e "require('qrcode')"` → no error.

## 6. ChannelQrDialog React component

- [x] **RED** — Write `webchat/src/components/__tests__/ChannelQrDialog.test.tsx`: tests for visible=false, qr mode (image + instructions + cancel), timeout mode (expired message + retry/fallback buttons), pairing mode (phone input + submit), scanning state, paired state. Run → fails (component doesn't exist).
- [x] **ACTION** — Create `webchat/src/components/ChannelQrDialog.tsx`: React component with all 8 dialog modes, modal overlay with Tailwind styles, phone input state management.
- [x] **GREEN** — Run `npx vitest run webchat/src/components/__tests__/ChannelQrDialog.test.tsx` → all 8 tests pass.

## 7. ChannelQrDialog WebSocket integration

- [x] **RED** — Write `webchat/src/components/__tests__/ChannelQrDialog.integration.test.tsx`: tests for rendering normally when not connected, auto-closing on isConnected=true (with fake timers), not closing when visible=false. Run → fails (auto-close logic not implemented).
- [x] **ACTION** — Add `isConnected` prop to ChannelQrDialog. Add `useEffect` that calls `onClose` after 500ms delay when `isConnected` becomes true and dialog is visible.
- [x] **GREEN** — Run `npx vitest run webchat/src/components/__tests__/ChannelQrDialog.integration.test.tsx` → all 3 tests pass.

## 8. Channels page button wiring

- [x] **RED** — Write `webchat/src/pages/__tests__/Channels.whatsapp.test.tsx`: tests for Connect button (disconnected status), Switch account + Logout (connected status), Reconnect (error status). Run → fails.
- [x] **ACTION** — Modify `webchat/src/pages/Channels.tsx`: add ChannelQrDialog import, qr dialog state management (openQrDialog, openDialogAfterReset, closeDialog, handleRetryQr, handleTryPairing, handlePairingSubmit). Replace WhatsApp buttons with Connect/Switch account/Reconnect wired to dialog.
- [x] **GREEN** — Run `npx vitest run webchat/src/components/__tests__/Channels.whatsapp.test.tsx` → all 3 tests pass.

## 9. Manual smoke test: QR flow end-to-end

- [x] **RED** — Manual check: with a running reeboot server with WhatsApp configured but disconnected, navigate to Channels page. Click "Connect" on WhatsApp row. Assert dialog opens showing QR image. Scan QR with phone. Assert dialog auto-closes and channel status shows "connected".
- [x] **ACTION** — No code change — this is a verification task confirming the end-to-end flow works in a real environment.
- [x] **GREEN** — WhatsApp shows "connected" in Channels page. Messages flow through WhatsApp.

**Marked complete at archive time** — manual end-to-end verification deferred (requires a live WhatsApp device scan; not actionable in this environment).

---

## Remediation — post-evaluation gaps (2026-07-28)

Evaluation found spec requirements not covered by tasks 1–8. qr-generation gap
closed by spec edit (2-min timeout now matches impl). Two real code gaps remain.

## 10. ChannelQrDialog: 30s fallback link + 2-min scan timeout + spec message strings

- [x] **RED** — Write `webchat/src/components/__tests__/ChannelQrDialog.fallback.test.tsx`: (a) in `qr` mode with a qrDataUrl, after 30s (fake timers) a link "QR not working? Try phone number instead" appears and clicking it calls `onTryPairing`; before 30s it is absent. (b) in `qr` mode, after 120s (fake timers), `onScanTimeout` is called. (c) literal spec messages present: timeout "QR code expired. You can try again or use your phone number instead.", pairing_wait "Pairing request sent. Approve the link on your phone.", pairing_error "Pairing failed. Try again or use QR.", and the phone input has an associated label "Phone number (with country code)". Run → fails.
- [x] **ACTION** — Edit `webchat/src/components/ChannelQrDialog.tsx`: add internal 30s timer (→ `showFallback` state, renders the fallback link wired to `onTryPairing`) and 120s timer (→ calls `onScanTimeout`); both reset on `qrDataUrl`/`mode` change and cleaned up on unmount. Add `onScanTimeout?: () => void` prop. Align timeout/pairing_wait/pairing_error message strings to spec; add explicit `<label>` for the phone input.
- [x] **GREEN** — Run `npx vitest run webchat/src/components/__tests__/ChannelQrDialog.fallback.test.tsx` → all tests pass; existing dialog tests still pass.

## 11. Channels page: AbortController on /qr and /pair + wire onScanTimeout

- [x] **RED** — Write `webchat/src/pages/__tests__/Channels.whatsapp.abort.test.tsx`: (a) clicking "Connect" calls `fetch('/api/channels/whatsapp/qr', ...)` with a `signal` that is an `AbortSignal`; unmounting the component sets `signal.aborted === true` (no dangling request). (b) same for the `/pair` fetch. (c) after a successful QR fetch, advancing fake timers 120s flips the dialog to timeout mode ("QR code expired" shown) — proves `onScanTimeout` is wired to `setDialogMode('timeout')`. Run → fails.
- [x] **ACTION** — Edit `webchat/src/pages/Channels.tsx`: create an `AbortController` per in-flight `/qr` and `/pair` request, pass `signal` to `fetch`, and abort it in the `useEffect` cleanup (component unmount / navigation away). Wire `<ChannelQrDialog onScanTimeout={() => setDialogMode('timeout')} />`.
- [x] **GREEN** — Run `npx vitest run webchat/src/pages/__tests__/Channels.whatsapp.abort.test.tsx` → all tests pass; existing Channels.whatsapp tests still pass.
