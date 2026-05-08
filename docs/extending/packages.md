---
title: "Packages"
description: "Install community tool packages that bundle extensions, skills, and channel adapters."
---

# Packages

The reeboot package system lets you install community-built bundles that add tools, skills, and extensions to your agent.

---

## Installing Packages

```bash
reeboot install npm:reeboot-github-tools
reeboot install npm:reeboot-obsidian-tools
reeboot install git:github.com/you/my-reeboot-pack
reeboot install ./path/to/local-package
```

After installing, reload to activate:

```bash
reeboot reload
```

---

## Listing Installed Packages

```bash
reeboot packages list
```

---

## Uninstalling

```bash
reeboot uninstall reeboot-github-tools
```

---

## Publishing a Package

Any npm package with a `pi` manifest in `package.json` is compatible with reeboot's package system.

```json
{
  "name": "reeboot-my-tools",
  "version": "1.0.0",
  "pi": {
    "extensions": ["./dist/my-extension.js"],
    "skills": ["./skills/"]
  }
}
```

| Manifest field | Description |
|---|---|
| `pi.extensions` | Array of paths to compiled extension JS files |
| `pi.skills` | Array of paths to skill directories (each containing a `SKILL.md`) |

Publish to npm as normal:

```bash
npm publish
```

Users install it with:

```bash
reeboot install npm:reeboot-my-tools
```

---

## How It Works

Reeboot uses pi's `DefaultPackageManager` to install and track packages. Packages are installed globally (`npm install -g`) and registered in `~/.reeboot/agent/settings.json`. On startup, reeboot discovers all registered packages and loads their declared extensions and skills.

---

## Local Development

To test a package locally before publishing:

```bash
reeboot install ./path/to/my-package
```

The package directory is linked rather than copied, so changes are picked up on `reeboot reload`.
