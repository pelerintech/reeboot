# Spec — Root README

## Capability

A `README.md` file at the repository root that orients GitHub visitors.

---

## Scenarios

### GIVEN the repo root, WHEN a visitor views it on GitHub, THEN they see a clear project overview

- File exists at `README.md` (repo root)
- First heading is `# reeboot`
- Contains a one-line description of what reeboot is

### GIVEN the README, WHEN a visitor wants to install, THEN they find a Quick Start section

- Contains a section titled "Quick Start" (or similar)
- Shows `npm install -g reeboot` and the first command to run
- Mentions the setup wizard is triggered automatically on first run

### GIVEN the README, WHEN a visitor wants to know what reeboot can do, THEN they find a feature overview

- Contains a capabilities/features section
- Covers at minimum: WebChat, WhatsApp, Signal, scheduled tasks, extensions/skills, web search

### GIVEN the README, WHEN a visitor wants to understand the architecture, THEN they find a high-level diagram or description

- Contains an architecture section with ASCII diagram or equivalent

### GIVEN the README, WHEN a developer wants to contribute or run locally, THEN they find development instructions

- Contains a Development section
- Shows how to install deps and run tests

### GIVEN the README, WHEN a visitor wants more detail, THEN they find links to further resources

- Contains links to: `reeboot/README.md` (full usage), npm package, Docker Hub
