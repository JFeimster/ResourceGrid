# ResourceGrid YouTube Intelligence v2 — Batch 1

Source-specific YouTube ingestion pipeline for ResourceGrid.

## What it does

`Reconcile` mode:

1. inventories Moonshine Capital TV with YouTube Data API v3 when `YOUTUBE_API_KEY` is available;
2. falls back to / supplements with `yt-dlp`;
3. stores untouched source responses under `inbox/raw/youtube/<run-id>/`;
4. normalizes candidates under `inbox/normalized/youtube/<run-id>/`;
5. selectively acquires a bounded number of transcripts/captions;
6. reconciles by YouTube video ID → canonical watch URL → existing ResourceGrid ID → title as weak evidence;
7. extracts description URLs and resolves them against canonical ResourceGrid URLs;
8. captures playlists/memberships and Shorts classification evidence;
9. creates pre-promotion reconciliation reports and a promotion plan;
10. does **not** mutate `registries/`, `relationships/`, or `compiled/`.

`Promote` mode:

1. verifies canonical file hashes still match the reconciliation input state;
2. refreshes source-owned YouTube fields while preserving ResourceGrid-curated fields;
3. promotes clearly new videos without changing immutable IDs;
4. promotes only high-confidence explicit/source-backed relationship changes;
5. leaves transcript/taxonomy heuristic relationships held in reports;
6. runs `npm run registry:build`, `npm run lint`, and `npm run build`;
7. emits a final report and stops before commit/push.

## Requirements

- Node.js already used by ResourceGrid.
- PowerShell 7 recommended.
- At least one acquisition path:
  - `YOUTUBE_API_KEY` in the current process environment, or
  - `yt-dlp` on PATH.

No OAuth is required for Batch 1.

## Optional environment variables

```powershell
$env:YOUTUBE_API_KEY = "..."          # optional; session environment only
$env:YOUTUBE_CHANNEL_ID = "..."       # optional override
$env:YOUTUBE_CHANNEL_URL = "..."      # optional override
$env:YOUTUBE_TRANSCRIPT_LIMIT = "12"  # optional bounded transcript processing
$env:YOUTUBE_YTDLP_METADATA_LIMIT = "40" # optional yt-dlp metadata cap when API is also used
```

Never save credentials inside ResourceGrid files.

## Reconcile only

From the ResourceGrid repo root:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-youtube-ingestion.ps1 -Mode Reconcile
```

Or with a transcript cap:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-youtube-ingestion.ps1 -Mode Reconcile -TranscriptLimit 12
```

Inspect:

```text
reconciliation/youtube-v2-batch-1/<run-id>/summary.json
reconciliation/youtube-v2-batch-1/<run-id>/promotion-plan.json
```

## Promote the latest reconciled run

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-youtube-ingestion.ps1 -Mode Promote
```

Or promote a specific run:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-youtube-ingestion.ps1 -Mode Promote -RunId <run-id>
```

## Batch 1 guardrails

- Existing videos remain in `registries/content/youtube-videos.json` even when classified as Shorts.
- `registries/content/shorts.json` is not automatically populated or used for migration.
- Playlists are captured as source intelligence but are not new canonical entity types.
- Existing relationship registries are reused; no YouTube-specific relationship registry is created.
- Full transcript bodies remain in `inbox/raw/` and are never promoted to canonical entities.
- Ambiguous title-only matches stay held.
- Unmatched external description URLs stay held.
- Curated clusters, audiences, funnel stages, priority, CTA/resource assignments, notes, and other operator intelligence are preserved on source refresh.
