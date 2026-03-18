## MODIFIED Requirements

### Requirement: package.json is publication-ready
`package.json` SHALL include: `"version": "1.0.0"`, `"license": "MIT"`, `"engines": { "node": ">=22" }`, `"files": ["dist/", "extensions/", "skills/", "templates/", "container/"]`, `"exports": { ".": "./dist/index.js", "./channels": "./dist/channels/interface.js" }`, `"bin": { "reeboot": "./dist/index.js" }`, `"keywords": ["ai", "agent", "whatsapp", "signal", "personal-ai", "llm"]`.

#### Scenario: npm pack includes only listed files
- **WHEN** `npm pack --dry-run` is run
- **THEN** only files from the `files` array are included in the tarball

#### Scenario: engines field is present
- **WHEN** package.json is read
- **THEN** `engines.node` is `">=22"`

### Requirement: npx reeboot works on clean install
On a machine with Node 22 and no existing `~/.reeboot/` directory, `npx reeboot` SHALL download and execute the package, detect no config, and launch the interactive setup wizard.

#### Scenario: npx triggers wizard on clean install
- **WHEN** `npx reeboot` is run in a clean environment with no config
- **THEN** the setup wizard starts interactively

### Requirement: README covers all key topics
`README.md` SHALL contain sections: quick-start (3 commands), capabilities table, configuration reference, extension system ladder, WhatsApp/Signal setup, CLI reference, Docker usage, and community packages guide.

#### Scenario: README is present at root
- **WHEN** repository is cloned
- **THEN** `README.md` exists and contains "npx reeboot" in the quick-start section

### Requirement: CI runs tests on every push
`.github/workflows/ci.yml` SHALL run `npm ci && npm test` on Node 22 for every push to `main` and every PR. Tests SHALL pass before merging.

#### Scenario: CI runs on push to main
- **WHEN** code is pushed to main branch
- **THEN** GitHub Actions starts the test job

### Requirement: npm package is published on version tag
`.github/workflows/ci.yml` SHALL include a `publish` job that runs `npm publish --access public` when a `v*` tag is pushed, only after the test job passes.

#### Scenario: npm publish runs on version tag
- **WHEN** tag `v1.0.0` is pushed
- **THEN** the publish job runs and the package appears on npmjs.com
