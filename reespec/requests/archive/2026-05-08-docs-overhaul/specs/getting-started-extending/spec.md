# Spec — Getting Started + Extending Pages

## Capability: getting-started/introduction.md

GIVEN `docs/getting-started/introduction.md`
WHEN a new user reads it
THEN it explains what reeboot is (one paragraph), who it is for, and what
  makes it different — local, single-process, multi-channel, extensible

## Capability: getting-started/installation.md

GIVEN `docs/getting-started/installation.md`
WHEN a user follows the steps
THEN it covers:
  - npm global install (`npm install -g reeboot`)
  - Node.js version requirement (verified from package.json engines field)
  - Docker alternative
  - First-run behaviour (wizard auto-launches)

## Capability: getting-started/quick-start.md

GIVEN `docs/getting-started/quick-start.md`
WHEN a user follows it
THEN they have a running agent within 5 steps, no prior knowledge assumed

## Capability: getting-started/setup-wizard.md

GIVEN `docs/getting-started/setup-wizard.md`
WHEN a user reads it
THEN it explains every step the wizard asks:
  - authMode choice (pi vs own)
  - Provider selection (all 8 providers listed)
  - Model selection
  - Agent name
  - Channel setup
  - Search provider
  - How to re-run (`reeboot setup`)

## Capability: extending/skills.md

GIVEN `docs/extending/skills.md`
WHEN a developer reads it
THEN it explains:
  - What a skill is (Markdown SKILL.md file, loaded as system instruction)
  - Directory: `~/.reeboot/skills/<name>/SKILL.md`
  - All 15 bundled skills listed with what they do and what they require
  - Permanent vs ephemeral skills and TTL config
  - How the agent loads/unloads skills (load_skill, unload_skill, list_available_skills)
  - How to write a custom SKILL.md

## Capability: extending/extensions.md

GIVEN `docs/extending/extensions.md`
WHEN a developer reads it
THEN it explains:
  - What a pi extension is (TypeScript file in ~/.reeboot/extensions/)
  - Available hooks: tools, before_agent_start, agent_end, turn_start, turn_end, session_shutdown
  - Minimal extension example with a custom tool
  - How to hot-reload: `reeboot reload`
  - Core extensions that ship with reeboot and their config toggles
    (sandbox, confirm_destructive, protected_paths, session_name,
     custom_compaction, scheduler_tool, token_meter, mcp, injection_guard)
  - Config reference for `extensions.core.*` fields

## Capability: extending/packages.md

GIVEN `docs/extending/packages.md`
WHEN a developer reads it
THEN it explains:
  - Install: `reeboot install npm:<name>`, `git:`, `./local`
  - Uninstall: `reeboot uninstall <name>`
  - List: `reeboot packages list`
  - How packages declare extensions and skills via `pi` manifest in package.json
  - How to publish a community package
