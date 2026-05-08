# Spec — READMEs

## Capability: Root README rewrite

GIVEN the repo root `README.md`
WHEN a visitor lands on the GitHub repo page
THEN they see a marketing-oriented page with:
  - A one-sentence hook describing what reeboot is
  - A capability table covering all current features (including memory, knowledge,
    observability, budget, MCP, resilience — none of which exist in the current README)
  - An architecture ASCII diagram showing channel → orchestrator → LLM flow
  - A minimal quick-install block (`npm install -g reeboot`)
  - Links to the docs site sections for full details
  - No raw config JSON blocks (those belong in docs)
  - No inaccurate field names or outdated examples

## Capability: reeboot/README.md rewrite

GIVEN `reeboot/README.md`
WHEN a developer opens the package README (npm or GitHub)
THEN they see:
  - Install instructions (accurate)
  - Setup wizard walkthrough (accurate)
  - A minimal verified config.json example using correct field names:
    `agent.model.{ authMode, provider, id, apiKey }` (not flat)
  - CLI cheat-sheet covering ALL real commands including `logs`, `contexts`,
    `sessions`, `tasks due` that are currently missing
  - Signal config using `apiPort` (number), not `apiUrl` (string)
  - Links to docs for every section requiring depth

WHEN the README config example is compared to `reeboot/src/config.ts`
THEN every field name and type in the example matches the Zod schema exactly
