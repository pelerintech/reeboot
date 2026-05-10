# Spec — F1: `reeboot init` command + clean command map

## Capability

`reeboot init` is the dedicated first-time setup command. `reeboot start` (and `reeboot`
bare) errors clearly when no config exists instead of silently launching the wizard.

## Scenarios

### GIVEN no `config.json` exists
### WHEN `reeboot start` is run
### THEN it exits with a non-zero code
### AND prints "No configuration found. Run `reeboot init` to get started."

---

### GIVEN no `config.json` exists
### WHEN `reeboot` (bare, no subcommand) is run
### THEN it behaves identically to `reeboot start`
### AND prints the same "Run `reeboot init`" error message

---

### GIVEN no `config.json` exists
### WHEN `reeboot init` is run
### THEN the setup wizard launches

---

### GIVEN `reeboot init` completes successfully
### WHEN the user answers Y to "Start the agent now?"
### THEN the agent starts

---

### GIVEN `reeboot init` completes successfully
### WHEN the user answers N to "Start the agent now?"
### THEN "Run 'reeboot start' when you're ready." is printed
### AND the process exits cleanly

---

### GIVEN Step 1 of `reeboot init`
### WHEN the user selects "Docker"
### THEN "Docker support coming soon. Continuing with native setup." is shown
### AND the wizard continues with the native path
