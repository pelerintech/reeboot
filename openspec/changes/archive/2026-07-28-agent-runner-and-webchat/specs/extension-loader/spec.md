## ADDED Requirements

### Requirement: DefaultResourceLoader is configured with ~/.reeboot as agentDir
`src/extensions/loader.ts` SHALL create and export a `createLoader(contextConfig)` function that instantiates `DefaultResourceLoader` with `cwd` set to the context's workspace path and `agentDir` set to `~/.reeboot/`. This ensures global extensions and skills in `~/.reeboot/extensions/` and `~/.reeboot/skills/` are discovered automatically.

#### Scenario: Loader uses correct agentDir
- **WHEN** `createLoader({ workspacePath: "/tmp/ctx" })` is called
- **THEN** the returned loader's agentDir is `~/.reeboot/` (expanded from home)

### Requirement: Bundled extensions are always loaded via extensionFactories
The loader SHALL pass all bundled extension factories (sandbox, confirm-destructive, protected-paths, session-name, custom-compaction, scheduler-tool, token-meter) to `DefaultResourceLoader` via the `extensionFactories` option. Bundled extensions SHALL be active even if the user has no `~/.reeboot/extensions/` directory.

#### Scenario: Bundled extensions are loaded without user configuration
- **WHEN** a fresh `~/.reeboot/` directory exists with no `extensions/` folder
- **THEN** the loader reports bundled extensions as loaded (sandbox, confirm-destructive, protected-paths)

### Requirement: Core safety extensions can be toggled via config
If `config.extensions.core.sandbox = false`, the sandbox extension SHALL be excluded from `extensionFactories`. Same for `confirm_destructive` and `protected_paths`. `git_checkpoint` defaults to `false` (opt-in).

#### Scenario: Sandbox extension is excluded when disabled in config
- **WHEN** `config.extensions.core.sandbox = false`
- **THEN** the sandbox extension factory is not passed to the loader

#### Scenario: Git checkpoint is excluded by default
- **WHEN** config has no explicit `git_checkpoint` setting
- **THEN** the git-checkpoint extension is not loaded

### Requirement: User extensions in ~/.reeboot/extensions/ are auto-discovered
`DefaultResourceLoader` auto-discovers `.ts` files in the `agentDir/extensions/` path. After `loader.reload()` is called, newly dropped `.ts` files in `~/.reeboot/extensions/` SHALL be available to the agent.

#### Scenario: User extension is available after reload
- **WHEN** a `.ts` extension file is added to `~/.reeboot/extensions/` and `loader.reload()` is called
- **THEN** the extension's tools are available in the next agent turn

### Requirement: Bundled skills are always discoverable
The `skills/web-search/SKILL.md` and `skills/send-message/SKILL.md` files SHALL be in `~/.reeboot/skills/` or in the bundled skills path discovered by the loader. The agent SHALL see their descriptions in every context.

#### Scenario: Bundled skill descriptions appear in agent context
- **WHEN** an agent session is started
- **THEN** the agent's available skills include `web-search` and `send-message`
