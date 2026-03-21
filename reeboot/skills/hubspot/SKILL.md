---
name: hubspot
description: HubSpot CRM operations via HUBSPOT_ACCESS_TOKEN and curl — manage contacts, deals, companies, pipelines, and notes via the HubSpot v3 API. Use when working with CRM data in HubSpot.
---

# HubSpot

Uses `HUBSPOT_ACCESS_TOKEN` env var + curl against the HubSpot CRM v3 API to manage contacts, deals, companies, pipelines, and notes.

## Setup

1. Create a Private App in HubSpot:
   - Go to HubSpot Settings → **Integrations** → **Private Apps**
   - Click **Create a private app**
   - Name it (e.g., "reeboot-agent")
   - Under **Scopes**, add:
     - `crm.objects.contacts.read` / `crm.objects.contacts.write`
     - `crm.objects.deals.read` / `crm.objects.deals.write`
     - `crm.objects.companies.read` / `crm.objects.companies.write`
     - `crm.objects.notes.read` / `crm.objects.notes.write`
   - Click **Create app** → copy the **Access token** (starts with `pat-`)

2. Set the environment variable:
   ```
   export HUBSPOT_ACCESS_TOKEN=pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```
   Add to your shell profile for persistence.

3. Verify:
   ```
   curl -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
        https://api.hubapi.com/crm/v3/objects/contacts?limit=1
   ```

## Usage

```bash
# List contacts
curl -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
     "https://api.hubapi.com/crm/v3/objects/contacts?limit=20&properties=firstname,lastname,email"

# Search contacts
curl -X POST \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.hubapi.com/crm/v3/objects/contacts/search" \
  -d '{"filterGroups": [{"filters": [{"propertyName": "email", "operator": "EQ", "value": "john@example.com"}]}]}'

# Create a contact
curl -X POST \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.hubapi.com/crm/v3/objects/contacts" \
  -d '{"properties": {"email": "new@example.com", "firstname": "New", "lastname": "Contact"}}'

# List deals
curl -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
     "https://api.hubapi.com/crm/v3/objects/deals?limit=20&properties=dealname,amount,closedate,dealstage"

# Create a deal
curl -X POST \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.hubapi.com/crm/v3/objects/deals" \
  -d '{"properties": {"dealname": "New Deal", "amount": "10000", "closedate": "2026-06-30", "pipeline": "default", "dealstage": "appointmentscheduled"}}'

# List companies
curl -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
     "https://api.hubapi.com/crm/v3/objects/companies?limit=20&properties=name,domain,industry"

# Create a note
curl -X POST \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.hubapi.com/crm/v3/objects/notes" \
  -d '{"properties": {"hs_note_body": "Called customer, interested in enterprise plan.", "hs_timestamp": "2026-03-20T10:00:00Z"}}'
```
