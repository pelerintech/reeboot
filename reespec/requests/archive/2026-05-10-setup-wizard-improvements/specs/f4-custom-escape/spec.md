# Spec — F4: "Enter custom value..." escape hatch

## Capability

Every select list in the wizard (provider, model, search backend) includes an
"Enter custom value..." option. Selecting it prompts for a free-text value.

## Scenarios

### GIVEN the provider select list
### WHEN rendered
### THEN "Enter custom value..." is the last option

---

### GIVEN the user selects "Enter custom value..." on the provider list
### WHEN prompted
### THEN a text input appears asking for the custom provider value

---

### GIVEN the model select list for any provider
### WHEN rendered
### THEN "Enter custom value..." is the last option

---

### GIVEN the user selects "Enter custom value..." on the model list
### WHEN prompted
### THEN a text input appears asking for the custom model ID

---

### GIVEN the web search backend select list
### WHEN rendered
### THEN "Enter custom value..." is the last option

---

### GIVEN the user selects "Enter custom value..." on the search backend list
### WHEN prompted
### THEN a text input appears asking for the custom backend value
