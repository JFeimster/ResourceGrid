---
name: moonshine-funding-pipeline-health
description: Turn Moonshine Capital's active funding opportunities into evidence-backed operating queues with recommended next actions. Use for active-pipeline reviews, not approval decisions.
metadata:
  version: 1.0.0
---

# Moonshine Funding Pipeline Health

Classify active opportunities into operational queues: Active, Needs Jason, Needs Applicant, Needs Provider, Missing Docs, Bank Link Needed, Underwriting Pending, No Response, Overdue, Parallel Lane Candidate, Ready for Next Stage, and Nurture / Close Review.

## Procedure

1. Inspect live deal stages, tasks, associations, notes, and recent Gmail context.
2. Mark data coverage clearly and detect stage conflicts rather than silently correcting them.
3. Assign each deal one primary queue, evidence, urgency, next action, responsible owner, and due timing.
4. Flag pipeline risks: stale activity, no next action, missing amount where expected, missing association, bank-link or underwriting gaps, provider delay, repeated silence, and mismatched communication state.
5. Escalate financial representations, provider terms, and disposition decisions for human review.

## Output

Return a ranked operator queue; a risk summary; and a short list of deterministic fixes that can safely be automated.

