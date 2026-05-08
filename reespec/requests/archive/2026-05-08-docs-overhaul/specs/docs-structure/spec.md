# Spec — Docs Folder Structure

## Capability: docs/ directory exists with correct layout

GIVEN the repo root
WHEN the docs-overhaul request is complete
THEN `docs/` exists at repo root (not inside `reeboot/`) containing exactly:

  getting-started/
    introduction.md
    installation.md
    quick-start.md
    setup-wizard.md

  channels/
    webchat.md
    whatsapp.md
    signal.md
    trust-and-access.md

  configuration/
    reference.md

  capabilities/
    memory.md
    domain-knowledge.md
    scheduling.md
    web-search.md
    mcp-tools.md
    token-budget.md
    proactive-agent.md

  security/
    sandbox.md
    injection-guard.md
    permission-tiers.md

  observability/
    logging.md
    events.md

  deployment/
    daemon.md
    docker.md
    resilience.md

  extending/
    skills.md
    extensions.md
    channel-adapters.md
    packages.md

## Capability: Every page has valid Astro frontmatter

GIVEN any file under `docs/`
WHEN opened by the Astro content loader
THEN the file begins with YAML frontmatter containing at minimum:
  - `title` (non-empty string)
  - `description` (non-empty string, ≤160 chars for SEO)

WHEN the frontmatter is parsed with a YAML parser
THEN it contains no syntax errors
