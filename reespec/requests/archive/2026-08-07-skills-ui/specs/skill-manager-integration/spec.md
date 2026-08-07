# Capability: skill-manager integration

## Scenarios

### SM-1 Only enabled user skills are advertised to pi
GIVEN a set of enabled and disabled user-facing skills and a set of internal skills
WHEN pi's skill paths are resolved
THEN the paths handed to pi include enabled user skills and internal skills
AND exclude disabled user skills

### SM-2 list_available_skills returns only enabled skills
GIVEN the agent calls `list_available_skills`
WHEN there are disabled skills in the catalog
THEN only enabled user-facing skills are returned

### SM-3 load_skill respects the enabled set
GIVEN the agent calls `load_skill` for a skill that is disabled
WHEN the enabled set is consulted
THEN the load fails and the agent is told the skill is not available

### SM-4 Enabled set is consulted live, not at startup
GIVEN a skill's enabled state changed since startup
WHEN the agent next calls `list_available_skills` or `load_skill`
THEN the current state is observed without reload/restart
