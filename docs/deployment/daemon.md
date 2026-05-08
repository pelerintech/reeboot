---
title: "Daemon Mode"
description: "Run reeboot as a background service using launchd on macOS or systemd on Linux."
---

# Daemon Mode

Reeboot can run as a persistent background service that starts automatically on login and restarts if it crashes.

---

## Start as a Daemon

```bash
reeboot start --daemon
```

This generates and registers a service unit for your platform:

| Platform | Mechanism | Unit label |
|---|---|---|
| macOS | launchd (`~/Library/LaunchAgents/`) | `com.reeboot.agent` |
| Linux | systemd user unit (`~/.config/systemd/user/`) | `reeboot.service` |

The service is set to start on login (`RunAtLoad: true` / `WantedBy=default.target`) and restart automatically if it exits.

---

## Stop the Daemon

```bash
reeboot stop
```

This stops the running service without unregistering it. It will restart on next login.

---

## Logs

Daemon logs are written to:

```
~/.reeboot/logs/reeboot.log        ← stdout
~/.reeboot/logs/reeboot-error.log  ← stderr (errors only)
```

Stream them live:

```bash
reeboot logs --follow
```

---

## macOS Details

The plist file is written to `~/Library/LaunchAgents/com.reeboot.agent.plist` and loaded with:

```bash
launchctl load -w ~/Library/LaunchAgents/com.reeboot.agent.plist
```

To manually unload:

```bash
launchctl unload ~/Library/LaunchAgents/com.reeboot.agent.plist
```

---

## Linux Details

A systemd user unit is written to `~/.config/systemd/user/reeboot.service` and enabled with:

```bash
systemctl --user daemon-reload
systemctl --user enable --now reeboot
```

To check status:

```bash
systemctl --user status reeboot
```

To stop:

```bash
systemctl --user stop reeboot
```

---

## Restart

```bash
reeboot restart
```

Gracefully restarts the agent (sends a restart signal if running as a daemon, or restarts the process directly).

---

## Notes

- The daemon runs as your user — no `sudo` or root access is required.
- Config changes require a restart to take effect: `reeboot restart`.
- If the agent crashes, the service manager (launchd/systemd) will restart it automatically.
