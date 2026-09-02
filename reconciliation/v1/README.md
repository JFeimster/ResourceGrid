# ResourceGrid Registry Reconciliation v1

This package reconciles the attached `JSON.zip` archive against the current canonical ResourceGrid baseline.

## Reports

- `source-inventory.json` — inventory of JSON sources in the archive.
- `registry-candidate-map.json` — maps source registries to intended ResourceGrid destinations or defer/review lanes.
- `duplicate-registry-report.json` — exact duplicate groups and registry version families.
- `entity-match-report.json` — source-record matches against the existing ResourceGrid canonical entities.
- `enrichment-plan.json` — fields that can enrich existing ResourceGrid entities from matched sources.
- `new-entity-candidates.json` — consolidated candidates not yet promoted into canonical ResourceGrid registries.
- `relationship-candidates.json` — grounded candidate relationships inferred from explicit source links such as Vercel→GitHub and assistant-stack membership.

## Reconciliation summary

- Archive files: 14,207
- JSON files: 413
- Exact duplicate groups: 2,941
- Redundant duplicate copies: 4,903
- Primary source records evaluated: 1,862
- Strong matches to existing ResourceGrid records: 83 source-record matches
- Possible matches requiring review: 40
- Consolidated new entity candidates: 995
- Existing canonical entities with enrichment opportunities: 46
- Relationship candidates: 299

## Promotion rule

Nothing in `new-entity-candidates.json` or `relationship-candidates.json` is canonical yet.

The next phase should:
1. review possible matches,
2. approve enrichment for existing entities,
3. approve new entities by target registry,
4. promote only approved records into canonical registries,
5. then build the validation/deduplication/compile engine.

This prevents the attached archive from becoming another bulk-imported source of duplicates.
