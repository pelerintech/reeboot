
## Evaluation — 2025-07-28 18:16

### qr-generation
verdict:  ⚠️ PARTIAL
reason:   spec requires "Baileys fails to generate a QR within **10 seconds**, THEN a timeout error is returned" — the code sets `timeoutMs: 120_000` (2 minutes) at `server.ts:567`, not 10 seconds. All other spec requirements (data URL format, adapter stop/start lifecycle, 2-min scan timeout) are met.
focus:    `reeboot/src/server.ts` line 567 — reduce timeout to 10s for the QR-generation phase, or separate the generation timeout from the scan timeout

### phone-pairing
verdict:  ✅ SATISFIED
reason:   spec requires `POST /api/channels/whatsapp/pair` with phone number validation (400), Baileys `pairingCode: true` + `phoneNumber`, adapter stop/auth-clear before pairing, and paired status response — all verified in `server.ts` lines 573–663 and confirmed by 5 passing tests

### reset
verdict:  ✅ SATISFIED
reason:   spec requires adapter stop, auth directory cleared, `{ status: "reset" }` response — implemented at `server.ts:665-680`, confirmed by 4 passing tests. Also works when adapter is already disconnected (stop is idempotent)

### channel-qr-dialog
verdict:  ⚠️ PARTIAL
reason:   spec states "WHEN the user has not scanned for **15 seconds**, THEN a 'QR not working?' fallback link appears" with text link "QR not working? Try phone number instead" — no 15-second timer mechanism exists anywhere in `ChannelQrDialog.tsx` or `Channels.tsx`. All other states (qr display, timeout with retry/fallback, pairing input, waiting, error, auto-close on connected) are implemented and tested.
focus:    `reeboot/webchat/src/components/ChannelQrDialog.tsx` — add 15-second timer in `qr` mode to reveal the "QR not working? Try phone number instead" fallback link

### channels-page-wiring
verdict:  ✅ SATISFIED
reason:   spec requires "Connect" for disconnected, "Reconnect" (calls POST /reset first) for error, "Switch account" (calls reset) alongside "Logout" for connected — all verified in `Channels.tsx` with `openQrDialog` / `openDialogAfterReset` helpers, confirmed by 3 passing UI tests. Dialog state is local (not persisted across navigation).

## Triage

✅ Safe to skip:   phone-pairing, reset, channels-page-wiring
⚠️  Worth a look:  qr-generation — timeout is 120s, spec says 10s
⚠️  Worth a look:  channel-qr-dialog — missing 15s "QR not working?" fallback link
❓  Human call:    none

---

## Evaluation — 2026-07-28 18:44

### qr-generation-capability
verdict:  ⚠️ PARTIAL
reason:   `qr-generation.md` requires that "Baileys fails to generate a QR within **10 seconds**" returns 408/500 with `{ error: "QR not generated within timeout" }`. The implementation in `src/server.ts:567` passes `timeoutMs: 120_000` (2 minutes), so the 10-second QR-generation threshold is never enforced; the error string is correct but only fires after 2 min. All other GIVENs (data-URL QR, stop+clear-auth when connected, `onSuccess`→`adapter.start()`, 2-min no-scan `onTimeout`) are present in `src/server.ts:521-574`.
focus:    `src/server.ts:567` — replace/augment `timeoutMs: 120_000` with a 10s QR-generation deadline distinct from the 2-min scan timeout.

### phone-pairing-capability
verdict:  ✅ SATISFIED
reason:   `phone-pairing.md` requirements map to `src/server.ts:580-662`: missing/empty `phone` → 400 `{ error: 'phone is required' }` (line 589, exact); socket created with `pairingCode: true` + `phoneNumber` (lines 619-620); `connection: 'open'` → `adapter.start()` + 200 `{ status: 'paired' }` (line 653, satisfies the `"pairing_requested" | "paired"` OR); 2-min timeout → 408 (line 637); already-connected reset-first is handled by the common stop+clear-auth preamble (lines 593-601). Minor: timeout message is `'Pairing timed out. Try again.'` (contains the spec phrase as substring).

### reset-capability
verdict:  ✅ SATISFIED
reason:   `reset.md` matches `src/server.ts:668-685`: empty body, `adapter.stop()` + `rmSync(authDir, recursive:true, force:true)` + recreate, returns `{ status: 'reset' }` 200. `reebotDir` resolves to `~/.reeboot` (`src/server.ts:116`), so the auth dir is `~/.reeboot/channels/whatsapp/auth/` exactly as specified. Same code path serves disconnected/error states (stays stopped, no auto-start). Reset→QR composition works since both endpoints clear auth independently.

### channel-qr-dialog-capability
verdict:  ⚠️ PARTIAL
reason:   `channel-qr-dialog.md` GIVEN for "QR not scanned for **15 seconds** → a 'QR not working? Try phone number instead' fallback link appears" is entirely missing — grep for `not working|15.?000|countdown|expires in` across `webchat/src/` returns no matches; `ChannelQrDialog.tsx` `qr` mode shows only the image + Cancel. The timeout GIVEN ("link timeout fires → error state") is only reachable when the `/qr` POST itself fails (`Channels.tsx:95-98`); after a QR is successfully returned, no client-side 2-min timer exists and the server `onTimeout` is a no-op once `settled=true` (`server.ts:562-566`), so an unscanned QR never transitions the dialog to `timeout`. Literal message strings also diverge: spec "QR code expired. You can try again…" vs impl "The QR code was not scanned in time…"; input is not labelled "Phone number (with country code)" (only an instructional paragraph). Present and correct: modal overlay, title "Connect WhatsApp", instructions, 280×280 `<img>`, Cancel, pairing_wait spinner + message, pairing_error buttons, auto-close-on-connected.
focus:    `webchat/src/components/ChannelQrDialog.tsx` (add 15s fallback link + literal message/label strings); `webchat/src/pages/Channels.tsx` (add client-side scan-timeout that flips to `timeout` mode).

### channels-page-wiring-capability
verdict:  ⚠️ PARTIAL
reason:   `channels-page-wiring.md` button mappings are present in `Channels.tsx`: disconnected→"Connect"→`openQrDialog` (QR mode), error→"Reconnect"→`openDialogAfterReset` (POST /reset then QR), connected→"Switch account"→`openDialogAfterReset` with "Logout" retained, dialog state local via `useState`, 5s polling + auto-close on `status==='connected'`. However the GIVEN "Navigating away cancels any ongoing link flow (component unmount cleanup aborts if possible)" is not implemented: the only cleanup is `clearInterval(interval)` (`Channels.tsx:57`); the in-flight `fetch('/api/channels/whatsapp/qr')` has no `AbortController` (grep for `abort|unmount|cleanup` in `Channels.tsx` returns no matches), so the link flow is not cancelled on navigation despite `AbortController` making it possible.
focus:    `webchat/src/pages/Channels.tsx` — add `AbortController` to the `/qr` and `/pair` fetches and abort in the `useEffect` cleanup.

## Triage

✅ Safe to skip:   phone-pairing-capability, reset-capability
⚠️  Worth a look:  qr-generation-capability (10s QR-gen timeout enforced as 2min); channel-qr-dialog-capability (15s "QR not working?" fallback link missing + client-side scan-timeout not wired + literal message/label strings diverge); channels-page-wiring-capability (no AbortController, ongoing /qr fetch not cancelled on unmount)
❓  Human call:    *(none — contract is precise enough to judge)*

---
## Evaluation — 2026-07-28 19:51

### qr-generation
verdict:  ✅ SATISFIED
reason:   `POST /api/channels/whatsapp/qr` (reeboot/src/server.ts:521) stops the adapter, clears
          auth via `rmSync`/`mkdirSync`, renders a PNG data URL via `toDataURL(qr,{width:280,
          margin:2})` returning `{ qrDataUrl }` 200; `onTimeout` returns `c.json({ error:
          'QR not generated within timeout' }, 408)` with `timeoutMs: 120_000`; `onSuccess`
          calls `adapter.start()`. `linkWhatsAppDevice` (whatsapp.ts:424) exposes `onQr`/
          `onSuccess`/`onTimeout`/`timeoutMs`. `qrcode` dep present (package.json:69). Tests
          `whatsapp-qr-endpoint.test.ts` (5) + `whatsapp-qr-coordination.test.ts` (3) pass.

### phone-pairing
verdict:  ⚠️ PARTIAL
reason:   Spec allows `{ status: "pairing_requested" }` OR `{ status: "paired" }`, but the
          endpoint (server.ts:580-665) only resolves 200 with `{ status: 'paired' }` AFTER
          `connection === 'open'` (server.ts:655) — it blocks until pairing completes and
          never produces the `pairing_requested` immediate-ack, so a pending (sent-but-not-
          approved) request yields no 200. Also spec says "missing or invalid" phone but
          only empty is checked (`if (!phone)` server.ts:633); no format validation. Socket
          is correctly created with `pairingCode: true` + `phoneNumber` (server.ts:648-649),
          2-min timeout → 408 `Pairing timed out` ✓, already-connected resets first ✓.
focus:    reeboot/src/server.ts:580-665 — return `pairing_requested` immediately on dispatch;
          define/validate "invalid" phone format

### reset
verdict:  ✅ SATISFIED
reason:   `POST /api/channels/whatsapp/reset` (server.ts:668) stops the adapter, `rmSync`
          (recursive) + `mkdirSync` on `authDir`, returns `{ status: 'reset' }` 200. `authDir
          = join(reebotDir,'channels','whatsapp','auth')` with `reebotDir` defaulting to
          `~/.reeboot` (server.ts:116) — matches spec path `~/.reeboot/channels/whatsapp/auth/`.
          Disconnected/error path clears auth and stays stopped ✓; reset-then-qr yields a
          fresh QR ✓ (qr endpoint re-clears auth). `whatsapp-reset-endpoint.test.ts` (4) pass.

### channel-qr-dialog
verdict:  ⚠️ PARTIAL
reason:   All seven modes, titles, instruction strings, button labels, QR `<img width=280
          height=280>`, 30s fallback link, timeout/pairing_error retry+fallback buttons, and
          auto-close-on-connected are present and match the spec verbatim
          (ChannelQrDialog.tsx). GAP: the pairing_wait GIVEN requires "Cancel button aborts
          and returns to channel list", but `closeDialog` (Channels.tsx) sets `visible=false`
          without calling `linkAbortRef.abort()` — the in-flight `/pair` fetch continues after
          Cancel. (Navigation-away abort IS satisfied via the unmount `useEffect` cleanup, but
          explicit Cancel-during-pairing_wait does not abort.)
focus:    reeboot/webchat/src/pages/Channels.tsx `closeDialog` — abort `linkAbortRef` on
          Cancel so the pending `/pair` request is cancelled

### channels-page-wiring
verdict:  ✅ SATISFIED
reason:   Disconnected → "Connect" (`openQrDialog`, no Login/Reconnect for WhatsApp);
          error → "Reconnect" (`openDialogAfterReset` calls `/reset` then QR); connected →
          "Switch account" (reset+QR) alongside retained "Logout" — all in Channels.tsx, with
          Login/Reconnect replaced for WhatsApp. Dialog state is local (not persisted);
          unmount `useEffect` aborts `linkAbortRef`. 5s `setInterval(fetchChannels, 5000)`
          sets `dialogIsConnected` on WhatsApp connected → dialog auto-closes; green
          `bg-emerald-500` indicator immediate. `Channels.whatsapp.test.tsx` +
          `Channels.whatsapp.abort.test.tsx` (25) pass.

## Triage

✅ Safe to skip:   qr-generation, reset, channels-page-wiring
⚠️  Worth a look:
- phone-pairing (PARTIAL) — endpoint blocks until pairing completes; never returns `{ status: "pairing_requested" }` immediate-ack, only `{ status: "paired" }` on `connection: 'open'`; "invalid" phone format not validated beyond empty check
- channel-qr-dialog (PARTIAL) — pairing_wait Cancel does not abort the in-flight `/pair` request (`closeDialog` doesn't call `linkAbortRef.abort()`)
❓  Human call:
- phone-pairing "invalid" phone — spec says "missing or invalid" but defines no format/regex for "invalid"; implementation only checks empty. Clarify what "invalid" means before re-evaluating

---

## Evaluation — 2026-07-29 13:05

### ChannelQrDialog UI
verdict:  ✅ SATISFIED
reason:   channel-qr-dialog.md requires a modal with title "Connect WhatsApp",
          instructions "Open WhatsApp → Settings → Linked Devices → Link a Device,
          then scan this QR code", a 280x280 QR `<img>`, a 30s "QR not working?
          Try phone number instead" fallback, a timeout state ("QR code expired.
          You can try again or use your phone number instead." + "Try QR again" /
          "Use phone number" buttons), a phone-input mode ("Phone number (with
          country code)" label, "+1234567890" placeholder, "Send pairing request"),
          a pairing_wait spinner state, auto-close on connected, and a pairing_error
          state with "Try again" / "Try QR instead". All present in
          webchat/src/components/ChannelQrDialog.tsx. The optional "Link expires in
          X:XX" countdown is omitted — spec marks it "(optional)".

### Channels page button wiring
verdict:  ✅ SATISFIED
reason:   channels-page-wiring.md requires a "Connect" button (disconnected → opens
          dialog in QR mode), a "Reconnect" button (error → POST /reset then dialog),
          a "Switch account" button alongside a retained "Logout" (connected), local
          dialog state that aborts on unmount, and auto-close when the 5s poll returns
          "connected". All present in webchat/src/pages/Channels.tsx:
          openQrDialog/openDialogAfterReset, `linkAbortRef.current?.abort()` cleanup
          in a useEffect return, `setInterval(fetchChannels, 5000)`, and
          statusColor('connected') → bg-emerald-500. Login/Reconnect for WhatsApp are
          replaced as required (those branches now only render for non-whatsapp).

### Phone number pairing fallback
verdict:  ✅ SATISFIED
reason:   phone-pairing.md requires POST /api/channels/whatsapp/pair to create a
          Baileys socket with `pairingCode: true` and `phoneNumber`, return
          `{ status: "pairing_requested" }` or `{ status: "paired" }` (200), return
          400 `{ error: "phone is required" }` when phone missing, time out at 2min
          returning `{ error: "Pairing timed out" }` (408) with adapter stopped, and
          reset-first when already connected. All present in src/server.ts (lines
          ~580-660): makeWASocket with pairingCode:true + phoneNumber, 400 validation,
          120_000ms PAIR_TIMEOUT_MS, adapter.stop()+auth clear before pairing, and
          `{ status: 'paired' }` on connection open. Tests pass
          (tests/whatsapp-pair-endpoint.test.ts, 5/5).
          Deviation worth a human eyeball: the timeout body returns
          `{ error: 'Pairing timed out. Try again.' }` (src/server.ts:637) where the
          spec wrote `{ error: "Pairing timed out" }` — the spec substring is present,
          but a strict `error === "Pairing timed out"` client check would fail.

### QR generation
verdict:  ✅ SATISFIED
reason:   qr-generation.md requires POST /api/channels/whatsapp/qr to stop adapter +
          clear auth, return 200 `{ qrDataUrl: "data:image/png;base64,..." }` rendered
          via the `qrcode` package, return 408 `{ error: "QR not generated within
          timeout" }` after 2min, call adapter.start() on onSuccess, and fire onTimeout
          leaving the adapter stopped. All present in src/server.ts (~521-571):
          adapter.stop(), rmSync/mkdirSync on authDir, `toDataURL(qr, { width: 280,
          margin: 2 })`, timeoutMs 120_000, onSuccess→adapter.start(), onTimeout→408
          with the exact spec string. `linkWhatsAppDevice` (src/channels/whatsapp.ts:424)
          exposes onQr/onSuccess/onTimeout/timeoutMs as specified. `qrcode` is a
          declared dependency (package.json:69). Tests pass
          (tests/whatsapp-qr-endpoint.test.ts 5/5, whatsapp-qr-coordination.test.ts 3/3).

### Reset / switch account
verdict:  ✅ SATISFIED
reason:   reset.md requires POST /api/channels/whatsapp/reset to return 200
          `{ status: "reset" }`, call adapter.stop(), empty the auth directory
          (~/.reeboot/channels/whatsapp/auth/), and leave the adapter stopped for a
          fresh subsequent /qr. All present in src/server.ts (~668-683): adapter.stop(),
          rmSync(authDir, {recursive, force}) + mkdirSync, returns
          `c.json({ status: 'reset' }, 200)`. Auth dir path is
          join(reebotDir, 'channels', 'whatsapp', 'auth'). Tests pass
          (tests/whatsapp-reset-endpoint.test.ts, 4/4).

## Triage

✅ All capabilities satisfied — no action required.

Note (human eyeball, not a blocker): phone-pairing timeout returns the string
`"Pairing timed out. Try again."` where the spec wrote `"Pairing timed out"`
(src/server.ts:637). Substring match holds; tighten only if a client does exact
equality on the error field.

---
