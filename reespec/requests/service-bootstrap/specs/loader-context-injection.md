# Spec — Loader Context Injection

## Capability

`getBundledFactories()` receives `context` in addition to `config`, allowing extensions that need the context workspace path (e.g. `budget-manager`) to receive the correct value rather than `process.cwd()`.

## Scenarios

### GIVEN a runner is created for context with workspacePath '/some/path'
WHEN the extension factories are built
THEN `budget-manager` receives `workspacePath: '/some/path'`
AND NOT `process.cwd()` (the reeboot package root)

### GIVEN a runner is created for context 'main' with a specific workspacePath
WHEN `makeBudgetManagerExtension(pi, { workspacePath, config })` is called
THEN `.task_budget.json` writes go to the context workspace directory
AND NOT to the directory where node was launched from

### GIVEN `getBundledFactories(context, config)` is called
WHEN the function signature is inspected
THEN it accepts `context: ContextConfig` as its first argument
AND `createLoader()` passes `context` through to `getBundledFactories()`

### GIVEN knowledge.enabled is true and getBundledFactories runs
WHEN the knowledge-manager factory executes
THEN `makeKnowledgeExtension(pi, config)` is called (not the old default export with no args)
AND `db` is passed explicitly via the factory closure (from `getDb()` at factory run time)
