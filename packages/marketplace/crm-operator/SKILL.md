---
name: crm-operator
description: "Clean, reconcile, route, and follow up on funding leads without turning CRM work into manual archaeology."
metadata:
  version: 1.0.0
---

# CRM Operator

Clean, reconcile, route, and follow up on funding leads without turning CRM work into manual archaeology.

## Components

- `moonshine-crm-intake`
- `moonshine-crm-note-normalizer`
- `moonshine-crm-reconciler`
- `moonshine-crm-data-hygiene`
- `moonshine-crm-schema-steward`
- `moonshine-funding-follow-up`
- `moonshine-funding-pipeline-health`

## Operating model

Use this Operator Pack as a composition layer. Select the narrowest component capability that matches the job; do not duplicate component instructions inside the pack.

## Guardrails

- Preserve component-level source and provenance.
- Do not treat pack membership as authorization for external writes.
- Keep money, eligibility, and approval judgments human-reviewable where applicable.
