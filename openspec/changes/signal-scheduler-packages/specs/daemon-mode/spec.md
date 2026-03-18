## ADDED Requirements

### Requirement: reeboot start --daemon generates and registers a service unit
On macOS, `reeboot start --daemon` SHALL generate `~/Library/LaunchAgents/com.reeboot.agent.plist` and call `launchctl load` to register and start it. On Linux, it SHALL generate `~/.config/systemd/user/reeboot.service` and call `systemctl --user enable --now reeboot`. The service SHALL start `reeboot start` (without `--daemon`) pointing at the current config.

#### Scenario: Daemon is registered on macOS
- **WHEN** `reeboot start --daemon` is run on macOS
- **THEN** `~/Library/LaunchAgents/com.reeboot.agent.plist` exists and `launchctl list | grep reeboot` shows the service

#### Scenario: Daemon is registered on Linux
- **WHEN** `reeboot start --daemon` is run on Linux
- **THEN** `~/.config/systemd/user/reeboot.service` exists and `systemctl --user is-enabled reeboot` returns "enabled"

### Requirement: reeboot stop stops the daemon service
`reeboot stop` SHALL call `launchctl unload` (macOS) or `systemctl --user stop` (Linux) to stop the running service without unregistering it.

#### Scenario: Stop halts the daemon
- **WHEN** `reeboot stop` is run with daemon running
- **THEN** the service is stopped but remains registered for next boot

### Requirement: Running as daemon logs to ~/.reeboot/logs/
When started as a daemon, reeboot SHALL write pino logs to `~/.reeboot/logs/reeboot.log` (stdout) and `~/.reeboot/logs/reeboot-error.log` (stderr). Log files SHALL be rotated at 10MB.

#### Scenario: Log file is created on daemon start
- **WHEN** reeboot is running as a daemon
- **THEN** `~/.reeboot/logs/reeboot.log` exists and contains structured JSON logs
