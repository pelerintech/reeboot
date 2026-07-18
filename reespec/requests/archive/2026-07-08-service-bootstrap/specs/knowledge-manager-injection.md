# Spec — Knowledge Manager Dependency Injection

## Capability

`knowledge-manager.ts` receives `config`, `db`, and registers its background job via `registerServerJobs()` — no phantom `pi.getXxx()` calls. When `knowledge.enabled: true`, all tools are registered and the extension is fully operational.

## Scenarios

### GIVEN knowledge.enabled is false (default)
WHEN the extension factory runs
THEN it returns immediately
AND no tools are registered
AND no file watcher is started

### GIVEN knowledge.enabled is true
WHEN `makeKnowledgeExtension(pi, config)` is called with valid config and db
THEN `knowledge_search` tool is registered
AND `knowledge_ingest` tool is registered
AND the file watcher starts on the raw knowledge directory

### GIVEN knowledge.enabled and knowledge.wiki.enabled are both true
WHEN `makeKnowledgeExtension(pi, config)` is called
THEN `knowledge_file` tool is registered
AND `knowledge_lint` tool is registered
AND wiki directories are initialised

### GIVEN knowledge.enabled is true and db is provided
WHEN `makeKnowledgeExtension(pi, config)` is called
THEN `loadVecExtension(db)` is called
AND `runKnowledgeMigration(db)` is called

### GIVEN knowledge.enabled is true
WHEN `makeKnowledgeExtension` is called with config and db as explicit arguments
THEN no call to `(pi as any).getConfig?.()` is made
AND no call to `(pi as any).getDb?.()` is made
AND no call to `(pi as any).getScheduler?.()` is made

### GIVEN knowledge.enabled and knowledge.wiki.enabled are both true
WHEN `registerServerJobs(db, scheduler, config)` is called
THEN `scheduler.registerJob()` is called with id `__knowledge_lint__`
AND the schedule matches `config.knowledge.wiki.lint.schedule`

### GIVEN knowledge.enabled is true but knowledge.wiki.enabled is false
WHEN `registerServerJobs(db, scheduler, config)` is called
THEN `scheduler.registerJob()` is NOT called

### GIVEN knowledge.enabled is false
WHEN `registerServerJobs(db, scheduler, config)` is called
THEN `scheduler.registerJob()` is NOT called
