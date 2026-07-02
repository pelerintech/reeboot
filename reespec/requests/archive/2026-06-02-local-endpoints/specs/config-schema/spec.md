# Spec — Config Schema

## Capability

Config.json schema supports multiple providers via a `providers` array, with backward-compatible migration from flat `provider`/`id`/`apiKey` fields. Each provider entry has `name`, `provider`, `id`, `apiKey`, `baseUrl`, `api`, and `default` fields.

## Scenarios

### GIVEN an existing config with flat provider fields
### WHEN loadConfig() is called
### THEN the flat fields are migrated to a providers array with default: true

---

### GIVEN a config with providers array
### WHEN loadConfig() is called
### THEN the providers array is preserved as-is

---

### GIVEN a config with providers array and one marked default: true
### WHEN loadConfig() is called
### THEN the default flag is preserved in the parsed config

---

### GIVEN a config with providers array and no default marked
### WHEN loadConfig() is called
### THEN all provider entries are preserved (first one will be used at startup)

---

### GIVEN a config with providers array containing baseUrl and api fields
### WHEN loadConfig() is called
### THEN baseUrl and api values are preserved

---

### GIVEN a config with empty providers array and empty provider field
### WHEN loadConfig() is called
### THEN no migration occurs and providers remains an empty array

---

### GIVEN a config with providers array where one entry has no apiKey
### WHEN loadConfig() is called
### THEN the entry is preserved with apiKey as empty string (startup will use default)
