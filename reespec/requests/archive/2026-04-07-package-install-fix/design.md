# Design: package-install-fix

## Root cause

Pi's `DefaultPackageManager` reads package lists from `settingsManager`, which reads
from `agentDir/settings.json`. Reeboot's loader creates a `DefaultResourceLoader`
with `agentDir: ~/.reeboot/agent/` and a `settingsManager` built from that dir.

For packages to be discovered, they must be listed in `~/.reeboot/agent/settings.json`
under the `packages` array — the same format pi uses in `~/.pi/agent/settings.json`.

Reeboot currently writes to `config.json` instead.

## Target: delegate to pi's package manager

Instead of reimplementing package install/uninstall, delegate to pi's
`DefaultPackageManager` directly. It handles:
- npm global install (`npm install -g`)
- settings.json package list management
- extension discovery on next reload

```typescript
// src/packages.ts (simplified target)

import { DefaultPackageManager, SettingsManager } from '@mariozechner/pi-coding-agent';
import { join } from 'path';
import { homedir } from 'os';

const agentDir = join(homedir(), '.reeboot', 'agent');

export async function installPackage(spec: string): Promise<void> {
  const settingsManager = SettingsManager.create(process.cwd(), agentDir);
  const pm = new DefaultPackageManager({ agentDir, settingsManager, cwd: process.cwd() });
  await pm.install(spec);
}

export async function uninstallPackage(name: string): Promise<void> {
  const settingsManager = SettingsManager.create(process.cwd(), agentDir);
  const pm = new DefaultPackageManager({ agentDir, settingsManager, cwd: process.cwd() });
  await pm.uninstall(name);
}

export async function listPackages(): Promise<InstalledPackage[]> {
  const settingsManager = SettingsManager.create(process.cwd(), agentDir);
  const globalSettings = settingsManager.getGlobalSettings();
  return (globalSettings.packages ?? []).map(spec => ({ spec, name: parseSpecName(spec) }));
}
```

After install, the package is listed in `~/.reeboot/agent/settings.json` and pi's
`DefaultPackageManager.resolve()` finds it on next `loader.reload()`.

## Migration: existing installs

Users who ran `reeboot install` before this fix have packages in `config.json`
but not in `settings.json`. On startup, migrate: read `config.extensions.packages`
from `config.json`, write them to `settings.json`, clear from `config.json`.

## reeboot reload

`reeboot reload` already calls `runner.reload()` → `loader.reload()` which calls
`DefaultResourceLoader.reload()` which calls `packageManager.resolve()`. Once
packages are in `settings.json`, reload picks them up automatically. No change needed.

## settings.json format

Pi's `settings.json` `packages` array uses the same spec format as `config.json`:
`npm:package-name`, `git:github.com/user/repo`, etc.

## Risks

- Pi's `DefaultPackageManager` API may not be fully exported — need to verify
  `DefaultPackageManager` is in pi's public exports
- `npm install -g` for user-scope packages means packages land in the global npm prefix
  (e.g. `/opt/homebrew/lib/node_modules/`) — this is consistent with how pi works
  but may surprise users expecting packages in `~/.reeboot/`
- If `npm install -g` is not desirable, alternative: use `--prefix agentDir` and
  configure pi's package manager with a custom npm prefix
