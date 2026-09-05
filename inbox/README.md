# ResourceGrid Inbox

`inbox/` is the non-canonical ingestion boundary.

## raw/
Untouched source exports. Preserve source IDs, URLs, filenames, timestamps, and original data.

Examples:
- `raw/github/github-repos-2026-09-05.json`
- `raw/notion/custom-gpts-export.json`
- `raw/wix/blog-posts.json`
- `raw/youtube/videos.json`

## normalized/
Source records transformed to ResourceGrid-compatible candidate fields. Keep provenance and unmatched source fields under `metadata`.

## rejected/
Candidates intentionally not promoted. Store the reason and, when applicable, the canonical entity they duplicate.

Example:
```json
{
  "candidate_id": "candidate-example",
  "rejected_reason": "duplicate_of_existing_entity",
  "canonical_resource_id": "tool-example"
}
```

## Promotion flow
`raw -> normalized -> deduplicate/match -> reconcile -> validate -> promote -> registries/relationships`

Rules:
- Nothing under `inbox/` is canonical.
- Never put secrets, tokens, passwords, CRM PII, or private applicant data here.
- Do not manually edit `compiled/`; compiled files are generated.
