# Spec: Skill Trust Boundary

---

## Capability: Bundled skills injected without trust marker

**GIVEN** an ephemeral skill loaded from the bundled catalog directory  
**WHEN** the `before_agent_start` hook in skill-manager injects it into the system prompt  
**THEN** the skill content does not contain `[USER-INSTALLED SKILL — LOWER TRUST]`

---

## Capability: User-installed skills injected with trust marker

**GIVEN** an ephemeral skill loaded from outside the bundled catalog directory (e.g. `~/.reeboot/skills-catalog/`)  
**WHEN** the `before_agent_start` hook in skill-manager injects it into the system prompt  
**THEN** the injected content contains `[USER-INSTALLED SKILL — LOWER TRUST]` before the skill instructions
