---
name: business-credit-operator
description: "Audit business credit, identify profile gaps, sequence remediation, and guide vendor/tradeline setup."
metadata:
  version: 1.0.0
---

# Business Credit Operator

Audit business credit, identify profile gaps, sequence remediation, and guide vendor/tradeline setup.

## Components

- `bizcredit-os`
- `business-credit-audit`
- `credit-report-analysis`
- `credit-score-improvement`
- `vendor-setup-guide`

## Operating model

Use this Operator Pack as a composition layer. Select the narrowest component capability that matches the job; do not duplicate component instructions inside the pack.

## Guardrails

- Preserve component-level source and provenance.
- Do not treat pack membership as authorization for external writes.
- Keep money, eligibility, and approval judgments human-reviewable where applicable.
