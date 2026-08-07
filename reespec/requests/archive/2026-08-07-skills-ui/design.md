# Skills UI — design

## Overview

The human driver manages user-facing skills through a **Skills page** in the web
UI. The model has three layers:

```
1. CATALOG   — every user-facing skill on disk
               (bundled extension skills + user-uploaded skills)
2. ENABLED   — user-curated on/off set, lived in via the UI
3. ACTIVE    — transient; enabled skills load on demand via the ephemeral TTL path
```

Internal/harness skills live in a **separate folder outside the user catalog**,
always-in-context, never user-manageable.

## Harness vs extension boundary

- **Internal / harness** (separate folder, e.g. `skills/internal/`): visual-charting,
  visual-planning, web-research, send-message, reeboot-tasks. Always in context,
  NOT shown in the UI, NOT toggleable. Loaded by the harness.
- **User catalog** (bundled + uploaded): github, gmail, hubspot, slack, docker,
  gcal, gdrive, linear, notion, postgres, sqlite, files + user-uploaded skills.
  The UI manager operates on these.

The boundary is **physical** (separate directories), so "everything in the user
catalog is user-manageable" is true by construction. The two domains stay
independently extensible.

## Enabled set

- The enabled set is a persistent list of user-facing skill names that are ON.
  It **replaces** `config.skills.permanent` as the availability model.
- Persisted in `~/.reeboot/skills-state.json` as `{ enabled: string[] }`
  (mirrors the existing `active-skills.json` pattern — small, survives restarts,
  live-readable).
- **Live-read, no restart:** `list_available_skills` and `load_skill` consult the
  current enabled set each call. The REST layer writes the store; the extension
  reads it per call.
- Enabled skills are never pre-injected; they load on demand via the existing
  ephemeral TTL path (`before_agent_start` injection only when the agent actually
  loads one).

## SDK independence

The enabled-set store and the "compute active skill paths" filter are **reeboot
level, SDK-agnostic** — one implementation. Per-SDK delivery seam advertises the
chosen paths into that SDK's prompt.

- **pi (now):** filter `additionalSkillPaths` handed to pi down to
  enabled + internal, and (where live no-restart matters) feed enabled paths via
  `resources_discover` / per-turn delivery.
- **ree (future):** the ReeExtensionAdapter supports the shared ExtensionAPI; a
  later change adds the delivery seam (emit `resources_discover` on the ReeChat +
  consume skillPaths in the ReeRuntime prompt builder). Not in scope here.

Constraint: do not bake the filtering into the pi loader path.

## Upload pipeline (Layer 1 — package validation)

A user uploads a **zip** containing one skill's contents at the archive root
(`SKILL.md` + helper files). Validation before promotion:

1. Inspect the zip **central directory** (no extraction): reject any entry with
   `..` / absolute / traversing paths; reject symlinks/device entries; cap entry
   count and total expanded bytes; reject decompression-bomb ratios; allowlist
   file types (`.md`, `.js`, `.json`, `.txt`, ...).
2. Extract into a **temp dir**.
3. Re-validate the extracted result: `SKILL.md` present, frontmatter `name` +
   `description` parse.
4. Reject on **name collision** with an existing skill (bundled or uploaded) —
   the user gets an error explaining why.
5. Promote into the user upload catalog (`~/.reeboot/skills-catalog/<name>/`).

Content-level trust (Layer 2) is delegated to existing agent security/context
policies — not part of this feature.

## REST API

Under `/api/skills`, consistent with existing server.ts Hono endpoint patterns and
auth:

- `GET /api/skills` — list all user-facing skills (bundled + uploaded) with
  name, description, source (`bundled` | `user`), and enabled state.
- `PUT /api/skills` (body `{ name, enabled }`) — set enabled state; persists.
- `POST /api/skills/upload` (multipart zip) — validate + promote; returns the new
  skill or an error (collision / invalid package).
- `DELETE /api/skills/:name` — remove a user-uploaded skill (files gone). Bundled
  skills cannot be deleted.

## Web UI — Skills page

- Add a `skills` tab to `App.tsx` alongside chat/channels/logs/settings.
- New `pages/Skills.tsx` lists skills grouped by enabled state, with a toggle per
  row, an upload control, and a delete action for user-uploaded skills.
- Uses the existing `fetch('/api/skills...')` pattern.

## Skill-manager extension changes

- `additionalSkillPaths` handed to pi is filtered to enabled + internal (no longer
  the whole catalog dir).
- `resolveCatalogRoots()` returns only the **user catalog** (bundled user-facing +
  extended upload dir) — internal skills are not part of the user catalog.
- `list_available_skills` returns only **enabled** user-facing skills.
- `load_skill` rejects skills that are not enabled (or the agent can't see them).
- The `isBundledSkill` lower-trust marker continues to apply to user-uploaded
  active skills.

## Risks / notes

- The live no-restart behavior depends on the extension re-reading the enabled
  store per call rather than caching at construction. State file read must be
  cheap (small file / in-process memo with invalidate on write).
- Moving internal skills out of the catalog touches both the on-disk layout and
  the loader's `additionalSkillPaths`; must not accidentally stop loading the
  internal set.
- The two loose `.md` files (visual-charting/visual-planning) are harness-internal
  and relocate into the internal folder.
