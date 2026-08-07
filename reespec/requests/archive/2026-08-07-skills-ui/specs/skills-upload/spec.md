# Capability: skill upload (zip)

## Scenarios

### UP-1 Valid zip uploads and becomes available
GIVEN a user uploads a zip whose root contains `SKILL.md` with parsable
`name` + `description` frontmatter and (optionally) helper files
WHEN `POST /api/skills/upload` is called
THEN the skill is validated and promoted into the upload catalog
AND it appears in `GET /api/skills` and is enabled

### UP-2 Name collision is rejected with a reason
GIVEN a user uploads a skill whose name matches an existing skill (bundled or
previously uploaded)
WHEN `POST /api/skills/upload` is called
THEN the upload is rejected with an error explaining the name already exists

### UP-3 Path-traversal zip is rejected
GIVEN a zip containing an entry with `..` or an absolute path
WHEN `POST /api/skills/upload` is called
THEN the upload is rejected and nothing is written outside the upload catalog

### UP-4 Decompression-bomb zip is rejected
GIVEN a zip whose total expanded size (or a single entry) exceeds the configured
cap
WHEN `POST /api/skills/upload` is called
THEN the upload is rejected and nothing is extracted

### UP-5 Zip without a valid SKILL.md is rejected
GIVEN a zip that does not contain a SKILL.md with valid frontmatter
WHEN `POST /api/skills/upload` is called
THEN the upload is rejected with a clear error

### UP-6 Disallowed file types are rejected
GIVEN a zip containing entries of a disallowed type (e.g. an executable or
symlink)
WHEN `POST /api/skills/upload` is called
THEN the upload is rejected
