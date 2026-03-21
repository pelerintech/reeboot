# Spec: package management via pi's DefaultPackageManager

## PM-1: installPackage writes to ~/.reeboot/agent/settings.json

GIVEN `reeboot install npm:some-extension` is run
WHEN installPackage('npm:some-extension') completes
THEN `~/.reeboot/agent/settings.json` contains `"npm:some-extension"` in its packages array
AND the package is physically installed (discoverable by pi's loader on next reload)

## PM-2: uninstallPackage removes from settings.json

GIVEN `npm:some-extension` is listed in `~/.reeboot/agent/settings.json`
WHEN uninstallPackage('some-extension') completes
THEN `~/.reeboot/agent/settings.json` no longer contains `"npm:some-extension"`

## PM-3: listPackages reads from settings.json

GIVEN `~/.reeboot/agent/settings.json` has packages: ["npm:ext-a", "npm:ext-b"]
WHEN listPackages() is called
THEN returns [{ spec: "npm:ext-a", name: "ext-a" }, { spec: "npm:ext-b", name: "ext-b" }]

## PM-4: migration — existing config.json packages moved to settings.json

GIVEN `~/.reeboot/config.json` has `extensions.packages: ["npm:old-ext"]`
AND `~/.reeboot/agent/settings.json` does not contain "npm:old-ext"
WHEN the server starts (migratePackages() called)
THEN `~/.reeboot/agent/settings.json` contains "npm:old-ext"
AND `config.json` no longer has extensions.packages

## PM-5: loader picks up installed packages after reload

GIVEN a package was installed via installPackage() and listed in settings.json
WHEN loader.reload() is called (via `reeboot reload`)
THEN the package's extensions/skills/prompts are available in the next session

## PM-6: packages CLI command shows installed packages

GIVEN packages are listed in settings.json
WHEN `reeboot packages` is run
THEN the output lists all installed package specs and names
