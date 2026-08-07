# Capability: skills-api-remote

The REST layer surfaces the third source and the catalog browse/install endpoints.

## Scenarios

### API-1: List returns remote source
**GIVEN** `GET /api/skills` with a remote skill installed
**WHEN** the response is returned
**THEN** each entry includes `{ name, description, source, enabled }` where `source`
is `bundled`, `user`, or `remote`; internal skills are never listed.

### API-2: Catalog availability is browsable
**GIVEN** a configured `skills.catalog_url`
**WHEN** `GET /api/skills/catalog` is called
**THEN** it returns the **available** (not-yet-installed) remote entries from the
manifest, with `name`, `description`, `version`, `category`, and whether that name
collides with an already-installed skill.

### API-3: Install a remote skill
**GIVEN** `POST /api/skills/catalog/install` with a valid `{ name }` from the
catalog
**WHEN** invoked
**THEN** the skill is installed (source `remote`), auto-enabled, and the response
returns the installed `{ name, description, source: 'remote', enabled: true }`.

### API-4: Delete a remote skill
**GIVEN** `DELETE /api/skills/:name` for a remote-installed skill
**WHEN** invoked
**THEN** the remote skill directory is removed and it is disabled. Bundled skills
remain non-deletable; internal skills return 400.

### API-5: Auth and error handling
**GIVEN** the skills endpoints
**WHEN** called without loopback/token authorization, or with a malformed/colliding
install
**THEN** unauthorized requests return 401 and bad installs return 4xx with a clear
error, matching existing `/api/skills` conventions.
