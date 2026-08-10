# Capability: pi-mode simplification

The `'pi'` auth mode (local convenience: ride an already-configured pi install) becomes simpler
under `0.84`: reeboot stops building `AuthStorage`/`ModelRegistry` and lets `createAgentSession`
default its runtime from the user's existing `~/.pi/agent`.

## Scenarios

### pi mode stops constructing auth internals

GIVEN a PiAgentRunner is created in `authMode === 'pi'`
WHEN `_getOrCreateSession()` runs
THEN reeboot no longer calls `AuthStorage.create`, `ModelRegistry.create`, or `SettingsManager.create`
against `~/.pi/agent` for the session
AND `createAgentSession` is passed `agentDir: ~/.pi/agent` (or equivalent) so it defaults its own
runtime to the user's existing `auth.json`/`models.json`.

### pi mode still creates a usable session

GIVEN an existing logged-in pi install at `~/.pi/agent`
WHEN a `'pi'`-mode runner prompts
THEN the session is created and a prompt runs without reeboot injecting its own credentials.

### own vs pi behavior is preserved in both directions

GIVEN both auth modes
WHEN the migration is complete
THEN `'own'` still injects reeboot's configured creds/product and `'pi'` still reuses the user's pi install —
neither mode regressed to the other's behavior.
