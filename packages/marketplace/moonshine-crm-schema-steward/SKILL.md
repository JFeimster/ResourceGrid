---
name: moonshine-crm-schema-steward
description: Govern Moonshine Capital's constrained HubSpot schema, field mapping, and custom-property budget. Use before recommending CRM fields, enum values, or schema changes.
metadata:
  version: 1.0.0
---

# Moonshine CRM Schema Steward

Inspect the live Contact, Company, and Deal schemas before proposing changes. Inventory standard, integration-managed, and custom properties; protect the HubSpot Free custom-property budget; and maintain a canonical mapping from intake concepts to approved destinations.

## Procedure

1. Retrieve the live schema and valid enum values.
2. Classify each field as standard, integration-managed, custom, duplicate, or note-only.
3. Map the requested information to an existing supported destination first.
4. Recommend a new property only when it is durable, repeatedly used, automatable, and materially improves reporting or routing.
5. Produce a change proposal with field purpose, object, type, allowed values, existing alternatives, budget impact, and migration/rollback notes.

## Guardrails

- Never invent a property, value, pipeline, or stage.
- Prefer notes for one-off, ambiguous, sensitive, or volatile information.
- Do not mutate live schema without explicit authorization and a reviewable proposal.

