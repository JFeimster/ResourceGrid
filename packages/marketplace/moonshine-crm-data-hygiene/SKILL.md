---
name: moonshine-crm-data-hygiene
description: Audit and safely improve Moonshine Capital CRM record quality, duplicates, associations, stale work, and reconciliation backlog. Use for audits and cleanup planning, not routine intake.
metadata:
  version: 1.0.0
---

# Moonshine CRM Data Hygiene

Audit contacts, companies, deals, associations, notes, tasks, malformed values, and conflicting source data. Classify each finding as a safe repair, review-required recommendation, or verified clean record.

## Procedure

1. Define coverage as complete, sampled, or partial/paginated.
2. Detect duplicate candidates with evidence, not name similarity alone.
3. Identify orphan associations, speculative companies, stale deals, missing notes, overdue tasks, incomplete records, and conflicting fields.
4. Make only non-destructive, evidence-backed repairs when authorized; queue merges, deletes, and uncertain changes for review.
5. Publish a prioritized cleanup backlog with record IDs, evidence, proposed action, owner, and risk.

## Guardrails

- Never merge or delete solely from fuzzy similarity.
- Preserve source attribution and meaningful timeline history.
- Dry-run canonical or destructive changes before applying them.

