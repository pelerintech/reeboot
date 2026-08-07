# Capability: enabled set

## Scenarios

### EN-1 Store persists enabled state across restarts
GIVEN the user has toggled a set of skills on and off via the UI
WHEN the agent restarts
THEN the same set of skills is still enabled/disabled

### EN-2 Enabled state is read live (no restart)
GIVEN a user disables a skill in the UI
WHEN the next agent turn runs
THEN the agent no longer sees or can load that skill — with no reload/restart

### EN-3 Enabled state is read live on enable
GIVEN a user enables a skill in the UI
WHEN the next agent turn runs
THEN the agent can see and load that skill — with no reload/restart

### EN-4 Store is the single source of truth
GIVEN both the REST layer and the skill-manager extension need enabled state
WHEN either reads or writes the enabled set
THEN they read/write the same store
AND both observe each other's changes without restart
