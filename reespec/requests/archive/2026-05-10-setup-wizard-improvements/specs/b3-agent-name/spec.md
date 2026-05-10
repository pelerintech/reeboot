# Spec — B3: Agent name template substitution

## Capability

The agent name configured during setup is reflected in the agent's identity file
(`AGENTS.md`). The template placeholder `{{AGENT_NAME}}` is replaced at scaffold
time. Re-running setup with a new name updates the file.

## Scenarios

### GIVEN a configured agent name of "Ree"
### WHEN `reeboot init` completes scaffolding
### THEN `~/.reeboot/contexts/main/AGENTS.md` contains "Ree"
### AND does NOT contain "Reeboot" or "{{AGENT_NAME}}"

---

### GIVEN `AGENTS.md` already exists with name "Ree"
### WHEN `reeboot setup` is run and the agent name is changed to "Nova"
### THEN `AGENTS.md` is updated to contain "Nova"

---

### GIVEN the `main-agents.md` template
### WHEN inspected
### THEN it contains `{{AGENT_NAME}}` placeholder
### AND does NOT contain the hardcoded string "Reeboot"
