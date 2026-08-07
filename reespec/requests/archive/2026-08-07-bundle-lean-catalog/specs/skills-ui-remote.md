# Capability: skills-ui-remote

The Skills page gains a remote-catalog browse/install surface, alongside the
existing toggle/upload/remove behavior.

## Scenarios

### UI-1: Installed remote skills appear in the main list
**GIVEN** the Skills page with a remote skill installed
**WHEN** the list renders
**THEN** the row shows the skill with `source: 'remote'` and a remove action
(bundled rows have no remove; user + remote rows do).

### UI-2: Catalog section lists available remote skills
**GIVEN** the Skills page with a configured catalog
**WHEN** the catalog section loads
**THEN** it lists **available** (not-yet-installed) remote entries with name +
description and an **Install** action per row.

### UI-3: Install from the UI
**GIVEN** an available catalog skill
**WHEN** the user clicks Install
**THEN** the skill installs (source `remote`), moves from the available list to the
installed list, and is toggled on — the page reflects the change without a full
reload.

### UI-4: Install errors are surfaced
**GIVEN** an install that fails (collision, invalid package, network/unreachable
catalog)
**WHEN** the user clicks Install
**THEN** a clear error reason is shown and the skill stays in the available list.

### UI-5: User upload keeps working unchanged
**GIVEN** the existing upload control on the Skills page
**WHEN** a user uploads a zip
**THEN** the previous upload + validation behavior is unchanged (promotes as
`source: 'user'`, auto-enables, rejects collisions).
