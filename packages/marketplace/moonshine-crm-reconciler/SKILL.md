---
name: moonshine-crm-reconciler
description: Reconcile Moonshine Capital operational state across Gmail, HubSpot, Notion, and the Master CRM Sheet. Use only when cross-system drift or conflicts need investigation.
metadata:
  version: 1.0.0
---

# Moonshine CRM Reconciler

Investigate cross-system identity, status, task, and communication mismatches. This is not the default intake path; activate it when a record or batch has meaningful system drift.

## Procedure

1. Declare the systems, date range, and coverage level being reconciled.
2. Resolve identity with the intake evidence hierarchy; retain unresolved candidates rather than merging them.
3. Compare record presence, key facts, stages/status, associations, tasks, notes, and recent communications.
4. Identify the canonical correction using source reliability and recency; propose safe deterministic repairs separately from review-required changes.
5. Output a reconciliation ledger with the conflict, evidence, recommended canonical state, proposed mutation, owner, and confidence.

## Guardrails

- Preserve the original source trail and never invent a canonical state.
- Do not make destructive corrections without a dry run and explicit authorization.
- Keep private CRM, Gmail, bank, and applicant data out of public artifacts.

