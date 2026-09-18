---
name: business-credit-audit
description: Audit a business's commercial credit profile, identity consistency, trade reporting, and public-record risks across Dun & Bradstreet, Experian Commercial, and Equifax Small Business. Use when reviewing business credit reports, investigating a credit denial, prioritizing credit-profile remediation, or documenting missing evidence for a commercial-credit application.
---

# Business Credit Audit

Produce an evidence-based audit. Distinguish verified facts from client statements, unavailable data, and reasonable—but unverified—risks. Do not promise an approval, score increase, reporting outcome, or removal of accurate information.

## Intake and safeguards

1. Confirm the goal, target lender/product, requested amount, and timeline.
2. Collect only documents needed for the review. Mask EINs, account numbers, and other sensitive identifiers in the deliverable unless their inclusion is essential.
3. Record each source and its effective date. Treat bureau files as point-in-time records.
4. If a report or field is unavailable, write `Not provided`; do not infer a score, tradeline, inquiry, or public record.

For data shape, provenance, and calculation rules, read [references/evidence-standards.md](references/evidence-standards.md). For a repeatable machine-readable intake, use `python scripts/validate_audit_input.py --input <audit.json>` and resolve every reported issue before relying on the file.

## Audit workflow

### 1. Establish the canonical business identity

Use Secretary of State filings and tax/bank documentation where available to establish the legal name, entity type, formation date, EIN status, physical address, phone, DBA(s), and D-U-N-S or bureau identifiers. Compare each field against every supplied bureau report.

Flag material differences, duplicate/fragmented files, stale addresses, and records reported under a DBA or name variant. Treat punctuation-only variations as minor unless the source indicates a separate file or adverse consequence.

### 2. Review each bureau independently

For D&B, Experian Commercial, and Equifax Small Business, capture only the scores, ratings, tradelines, inquiries, and public records shown in the supplied report. Note the report date, scope, and missing sections.

For each tradeline, record creditor, account type, opened date, status, payment history, current balance, credit limit (if reported), and reporting bureau(s). Calculate utilization only when both a balance and credit limit are reported; otherwise mark it `Not calculable`.

Check public records and adverse items against source documents where possible. A satisfied lien, terminated UCC, or resolved collection should be marked as a documentation/dispute candidate—not an error—until the official release or correction supports it.

### 3. Assess underwriting readiness

Identify factors relevant to the stated goal, such as thin reporting history, recent delinquencies, high reported utilization, adverse public records, identity inconsistency, or insufficient time in business. Avoid claims about undisclosed lender rules or proprietary fraud models.

Separate facts from implications:

- **Verified finding:** What the source shows.
- **Potential impact:** Why it may affect commercial underwriting, qualified by the target product when known.
- **Remediation:** The exact next action, owner, evidence needed, and expected verification point.

### 4. Prioritize remediation

Classify findings by the likely effect on the stated goal:

- **Critical:** Documented item likely to block or materially delay qualification.
- **Material:** Documented weakness likely to constrain terms, limits, or confidence.
- **Cleanup:** Administrative discrepancy with no demonstrated current underwriting impact.

Prioritize accuracy corrections and documented adverse issues before profile-building actions. For disputes, specify the bureau/furnisher, supporting evidence, submission method, and follow-up date. Do not recommend opening credit solely to inflate a score; tie every recommendation to the stated credit goal and ability to repay.

## Deliverable

Start from [assets/business-credit-audit-report.md](assets/business-credit-audit-report.md). Omit sections with no supplied data only if doing so improves clarity; otherwise mark them `Not provided`.

Read [references/remediation-playbook.md](references/remediation-playbook.md) when proposing a dispute, public-record correction, or tradeline-related action.

## Quality check

Before delivering, verify that every score, account count, legal assertion, and severity label is traceable to a dated source; all calculations state their inputs; sensitive data is minimized; and recommended actions have an owner and evidence requirement.
