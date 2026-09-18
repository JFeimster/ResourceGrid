---
name: builder-ops-starter
description: "Find the right local repo and launch the correct local preview without hunting through folders."
metadata:
  version: 1.0.0
---

# Builder Ops Starter

Find the right local repo and launch the correct local preview without hunting through folders.

## Components

- `find-local-repo`
- `start-local-site`

## Operating model

Use this Operator Pack as a composition layer. Select the narrowest component capability that matches the job; do not duplicate component instructions inside the pack.

## Guardrails

- Preserve component-level source and provenance.
- Do not treat pack membership as authorization for external writes.
- Keep money, eligibility, and approval judgments human-reviewable where applicable.
