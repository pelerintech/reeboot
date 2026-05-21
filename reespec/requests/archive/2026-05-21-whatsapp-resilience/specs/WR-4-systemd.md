# Spec WR-4 — systemd supervisor hardening

## Capability

The reeboot systemd service unit restarts the process under all exit conditions
(not just non-zero exits), with burst protection to prevent crash loops.

---

## WR-4-A: Generated unit uses `Restart=always`

**GIVEN** `startDaemon()` is called on Linux  
**WHEN** the unit file is written  
**THEN** the file contains `Restart=always`  
**AND** does NOT contain `Restart=on-failure`

---

## WR-4-B: Generated unit includes burst protection

**GIVEN** `startDaemon()` is called on Linux  
**WHEN** the unit file is written  
**THEN** the file contains `StartLimitIntervalSec=120`  
**AND** the file contains `StartLimitBurst=5`

---

## WR-4-C: Existing deployed unit on production machine reflects new values

**GIVEN** the production systemd unit at `~/.config/systemd/user/reeboot.service`  
**WHEN** `reeboot stop && reeboot start --daemon` is run  
**THEN** the unit file is rewritten with `Restart=always` and limit values  
*(Non-code task — manual verification on the server)*
