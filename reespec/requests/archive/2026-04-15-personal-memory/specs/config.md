# Spec: Memory Config

## Capability

Memory feature configuration in `config.json` with sensible defaults. Memory is opt-in (`enabled: false` by default). Session search is always available.

---

## Scenarios

### GIVEN config.json has no `memory` key
### WHEN config is parsed
### THEN memory defaults are applied: enabled=true, memoryCharLimit=2200, userCharLimit=1375, consolidation.enabled=true, consolidation.schedule="0 2 * * *"

---

### GIVEN config.json sets `memory.enabled: true`
### WHEN the memory-manager extension initialises
### THEN memory files are created if absent
### AND the `memory` tool is registered
### AND the memory block is injected at session start

---

### GIVEN config.json sets `memory.memoryCharLimit: 1000`
### WHEN the agent calls `memory(action="add")` that would exceed 1000 chars
### THEN the tool returns a capacity error referencing the 1000 char limit

---

### GIVEN config.json sets `memory.consolidation.schedule: "0 3 * * 1"`
### WHEN the scheduler initialises
### THEN the consolidation task is registered with that cron expression
