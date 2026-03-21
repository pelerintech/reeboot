## ADDED Requirements

### Requirement: Channel step shows multi-select with WebChat noted as always-on
The wizard SHALL show a checkbox list with WhatsApp and Signal as selectable options. WebChat SHALL be shown as always-on (not selectable). User may select any combination: WhatsApp only, Signal only, both, or neither (skip).

#### Scenario: No channels selected (skip)
- **WHEN** user selects neither WhatsApp nor Signal
- **THEN** config has only WebChat enabled; wizard proceeds to Step 3b

#### Scenario: Both channels selected
- **WHEN** user checks both WhatsApp and Signal
- **THEN** WhatsApp sub-flow runs first, then Signal sub-flow

### Requirement: WhatsApp inline linking with 2-minute timeout and fallback
When WhatsApp is selected, the wizard SHALL call `WhatsApp.linkDevice(onQr, onSuccess, onTimeout)`. The QR string SHALL be rendered via `qrcode-terminal`. The wizard SHALL start a 2-minute countdown. On success, config has `channels.whatsapp.enabled = true`. On timeout or skip, config has `channels.whatsapp.enabled = false` and a fallback command is printed.

#### Scenario: WhatsApp linked successfully
- **WHEN** `linkDevice` calls `onSuccess` before timeout
- **THEN** config draft has `channels.whatsapp.enabled = true`
- **THEN** "WhatsApp linked!" message is displayed

#### Scenario: WhatsApp QR times out
- **WHEN** 2 minutes pass without `onSuccess` being called
- **THEN** config draft has `channels.whatsapp.enabled = false`
- **THEN** fallback message "Run `reeboot channel login whatsapp` later" is printed
- **THEN** wizard continues to next step without blocking

#### Scenario: WhatsApp sub-flow skipped by user (S key)
- **WHEN** user presses S during QR display
- **THEN** same outcome as timeout: disabled in config, fallback printed, wizard continues

#### Scenario: WhatsApp temp auth dir cleaned on next wizard run
- **WHEN** wizard is interrupted during WhatsApp QR and run again
- **THEN** orphaned temp auth dir from previous run is deleted before new QR is shown

### Requirement: Signal inline linking with Docker detection (3 cases)
When Signal is selected, the wizard SHALL check Docker status via `checkDockerStatus()`. It SHALL handle three cases: not installed, not running, running. In all non-running cases it SHALL print a fallback command and continue. In the running case it SHALL prompt for phone number, start the container, and render the device link URL.

#### Scenario: Docker not installed
- **WHEN** Signal is selected and `checkDockerStatus()` returns `'not-installed'`
- **THEN** explanation printed with link to docker.com/products/docker-desktop
- **THEN** fallback command `reeboot channel login signal` printed
- **THEN** Signal is NOT enabled in config
- **THEN** wizard continues to next step

#### Scenario: Docker installed but not running
- **WHEN** Signal is selected and `checkDockerStatus()` returns `'not-running'`
- **THEN** wizard prompts "Start Docker Desktop then press Enter, or S to skip"
- **WHEN** user presses S
- **THEN** same outcome as Docker not installed

#### Scenario: Docker installed and running — phone number prompt
- **WHEN** `checkDockerStatus()` returns `'running'`
- **THEN** wizard prompts for phone number with country code
- **WHEN** user enters `+15551234567`
- **THEN** config draft has `channels.signal.phoneNumber = "+15551234567"`

#### Scenario: Signal container starts and QR URL shown
- **WHEN** Docker is running and phone number entered
- **THEN** wizard starts signal-cli-rest-api container
- **THEN** QR link URL is printed (not PNG-to-ASCII)
- **THEN** 3-minute timeout begins

#### Scenario: Signal linking times out
- **WHEN** 3 minutes pass without successful link
- **THEN** container is left running (for user to complete linking manually)
- **THEN** fallback message `reeboot channel login signal` is printed
- **THEN** wizard continues

#### Scenario: Signal linked successfully
- **WHEN** link succeeds before timeout
- **THEN** config draft has `channels.signal.enabled = true`
