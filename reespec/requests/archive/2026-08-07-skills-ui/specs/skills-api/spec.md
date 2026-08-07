# Capability: skills REST API

## Scenarios

### API-1 List skills
GIVEN skills exist in the bundled catalog and the upload catalog
WHEN a client calls `GET /api/skills`
THEN the response contains each user-facing skill with name, description,
source (`bundled` | `user`), and enabled state
AND no internal skills are included

### API-2 Toggle enabled state
GIVEN a skill exists
WHEN a client calls `PUT /api/skills` with `{ name, enabled }`
THEN the enabled state is updated and persisted
AND subsequent `GET /api/skills` reflects the change

### API-3 Toggling an internal skill is rejected
GIVEN an internal/harness skill
WHEN a client attempts to toggle it via `PUT /api/skills`
THEN the request is rejected with an error

### API-4 Unauthorized access is rejected
GIVEN the server is configured with a token and the request is non-loopback
WHEN a client calls any `/api/skills` endpoint without a valid token
THEN the request is rejected with 401
