# API route guards — pi-specific endpoints

## Capability

REST API endpoints that query pi-specific tables return empty data in ree mode instead of misleading or crashing.

## Scenarios

### S1: /api/contexts returns empty array in ree mode

GIVEN a ree-mode deployment
WHEN `GET /api/contexts` is called
THEN it returns an empty array `[]`

GIVEN a pi-mode deployment with contexts in the DB
WHEN `GET /api/contexts` is called
THEN it returns the existing contexts (unchanged behaviour)

### S2: /api/tasks returns empty array in ree mode

GIVEN a ree-mode deployment
WHEN `GET /api/tasks` is called
THEN it returns an empty array `[]`

### S3: /api/contexts/:id/sessions returns empty array in ree mode

GIVEN a ree-mode deployment
WHEN `GET /api/contexts/main/sessions` is called
THEN it returns an empty array `[]`

### S4: Health, status, channels, budget, logs, reload still work in ree mode

GIVEN a ree-mode deployment
WHEN `GET /api/health`, `GET /api/status`, `GET /api/channels`, `GET /api/settings/budget`, `GET /api/logs/stream`, `POST /api/reload` are called
THEN each returns its normal response (same behaviour as pi mode)
