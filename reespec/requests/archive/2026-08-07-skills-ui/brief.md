# Skills UI — visual management of user-facing skills

## What

Give the human driver of an agent a live, visual way to manage skills from the
web UI — enabling/disabling the skills their agent may use, uploading their own
skill zip archives, and removing user-uploaded skills — without SSH-ing into the
deployment, editing files, or restarting the agent.

## Why

Today the only ways a skill enters the system are config (`config.skills.permanent`)
or the agent calling `load_skill` itself. The human driver has no direct path to
curate which skills their agent has access to, and no way to add their own skills
short of placing files on the deployment server and restarting.

## Goals

- A three-layer model: **catalog** (every skill on disk) / **enabled set** (user
  toggles) / **active** (transient, ephemeral TTL).
- A **Skills page** in the web UI where the driver can enable/disable, upload,
  and remove skills.
- Uploads arrive as **zip** archives (SKILL.md + helpers at root), validated at
  the package level (Layer 1); content trust delegated to existing security
  policies (Layer 2).
- Enabled set is **live-read** — toggling takes effect next turn, **no restart**.
- **Harness/internal skills** physically separated from the user catalog, always
  in context, never user-manageable.
- The enabled-set filter and store live at the reeboot layer, **SDK-agnostic**.

## Non-goals

- Skills working in **ree mode** (explicitly deferred; design must remain
  SDK-independent so it ports later).
- Content-level ("Layer 2") validation of uploaded skills at upload time.
- User-facing (end-customer) skill management — this is the operator/driver path.

## Impact

- Adds a new tab and page to the web UI SPA.
- Adds a small set of REST endpoints under `/api/skills`.
- Adds an enabled-set store and live filter.
- Restructures the bundled `skills/` catalog (internal skills moved out of the
  user-visible catalog).
- Modifies the `skill-manager` extension: `additionalSkillPaths` handed to pi are
  filtered to enabled + internal; `list_available_skills` / `load_skill` gate on
  the enabled set.
- Supersedes `config.skills.permanent` as the availability model for user-facing
  skills.
