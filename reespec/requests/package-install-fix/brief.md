# Brief: package-install-fix

## What

`reeboot install` is broken. It installs npm packages to `~/.reeboot/packages/` and
records them in `config.json`, but the agent never loads them because pi's
`DefaultPackageManager` reads package lists from `agentDir/settings.json` — not
`config.json`. Installed extensions never appear in the agent's session.

## Why

Reeboot reimplemented package management (npm install + config.json tracking) instead
of delegating to pi's built-in `DefaultPackageManager`. The two systems don't talk to
each other: reeboot writes to `config.json`, pi reads from `settings.json`. The
packages are physically installed but pi never discovers them.

## Goals

- `reeboot install npm:some-extension` installs the package AND makes it available
  in the agent's next session
- `reeboot uninstall some-extension` removes it from both disk and the active set
- `reeboot packages` lists installed packages correctly
- `reeboot reload` picks up newly installed packages without restart
- Works with reeboot's `agentDir` (`~/.reeboot/agent/`) — packages listed in
  `~/.reeboot/agent/settings.json` and discovered by pi's loader on reload

## Non-goals

- Project-scoped packages (global user scope only for now)
- Git-sourced packages (npm packages only for now, same as today)
- UI for package management

## Impact

- Fixes: installed extensions silently not loading
- Enables: reeboot's extensibility story — users can add tools, skills, prompts
