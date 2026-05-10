# Spec — B4: InquirerPrompter rewrite (inquirer v13)

## Capability

`InquirerPrompter` correctly renders interactive menus on all terminals including
Linux SSH sessions, using the inquirer v13 `@inquirer/prompts` API.

## Scenarios

### GIVEN inquirer v13 is installed
### WHEN `InquirerPrompter` is imported
### THEN it implements the `Prompter` interface (select, input, password, checkbox, confirm)

---

### GIVEN `runSetupCommand` is called when config already exists
### WHEN the user is prompted "Config already exists. Overwrite?"
### THEN the prompt uses the new inquirer v13 API (not the legacy `inquirer.prompt()`)

---

### GIVEN the `Prompter` interface
### WHEN `FakePrompter` is used in wizard tests
### THEN all existing wizard tests pass without modification
