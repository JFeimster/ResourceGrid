const fs = require('fs');
const path = require('path');
const {
  ROOT, readJson, writeJson, isoNow, parseArgs, ensureRunDirs, getLatestRunId,
  registryCounts, getGitHead, getGitBranch, walk
} = require('./lib/common');

const args = parseArgs(process.argv.slice(2));
const runId = args.runId || getLatestRunId();
if (!runId) throw new Error('No run ID available for final report.');
const dirs = ensureRunDirs(runId);
const summaryFile = path.join(dirs.reconciliation, 'summary.json');
const promotionFile = path.join(dirs.reconciliation, 'promotion-result.json');
const summary = fs.existsSync(summaryFile) ? readJson(summaryFile) : {};
const promotion = fs.existsSync(promotionFile) ? readJson(promotionFile) : {};
const after = registryCounts();

function numericExit(value) {
  if (value === undefined || value === null || value === true) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
const exits = {
  registry_build: numericExit(args.registryBuildExit),
  lint: numericExit(args.lintExit),
  build: numericExit(args.buildExit)
};

function safeRead(file) {
  try { return readJson(file); } catch { return null; }
}
const validation = safeRead(path.join(ROOT, 'compiled', 'validation-report.json'));
const relationshipResolution = safeRead(path.join(ROOT, 'compiled', 'relationship-resolution-report.json'));
const dedupe = safeRead(path.join(ROOT, 'compiled', 'deduplication-report.json'));
const masterFile = path.join(ROOT, 'compiled', 'master-registry.json');
let transcriptLeak = false;
if (fs.existsSync(masterFile)) {
  const masterText = fs.readFileSync(masterFile, 'utf8');
  transcriptLeak = /WEBVTT/i.test(masterText) || /"transcript_(?:body|text|full_text)"\s*:/i.test(masterText);
}

const apiKey = process.env.YOUTUBE_API_KEY || '';
let apiKeyLeak = false;
if (apiKey.length >= 12) {
  const roots = ['scripts','sources','registries','relationships','reconciliation','enrichment','compiled'];
  outer: for (const relRoot of roots) {
    const root = path.join(ROOT, relRoot);
    for (const file of walk(root, (f) => /\.(?:js|mjs|cjs|ts|tsx|json|md|ps1|txt|yml|yaml)$/i.test(f))) {
      try {
        if (fs.statSync(file).size > 25 * 1024 * 1024) continue;
        if (fs.readFileSync(file, 'utf8').includes(apiKey)) { apiKeyLeak = true; break outer; }
      } catch {}
    }
  }
}

const validationErrors = validation?.summary?.schema_errors ?? validation?.errors?.length ?? null;
const unresolvedRelationships = relationshipResolution?.summary?.unresolved_relationships ?? relationshipResolution?.unresolved_count ?? relationshipResolution?.unresolved?.length ?? null;
const duplicateCanonicalIds = after.duplicate_canonical_ids.length;
const duplicateRelationshipIds = after.duplicate_relationship_ids.length;
const selfReferences = after.self_references.length;

const before = summary.canonical_counts_before || promotion.counts_before_promotion || {};
function delta(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  return b - a;
}

const finalReport = {
  batch: 'youtube-v2-batch-1',
  run_id: runId,
  generated_at: isoNow(),
  repo: {
    head: getGitHead(),
    branch: getGitBranch()
  },
  acquisition: summary.acquisition || {},
  reconciliation: {
    source_videos_discovered: summary.source_videos_discovered ?? null,
    existing_canonical_matches: summary.existing_canonical_matches ?? null,
    genuinely_new_videos: summary.genuinely_new_videos ?? null,
    unavailable_deleted_private_candidates: summary.unavailable_deleted_private_candidates ?? null,
    ambiguous_records: summary.ambiguous_records ?? null,
    duplicate_candidates: summary.duplicate_candidates ?? null,
    fields_proposed_for_update: summary.fields_proposed_for_update ?? null,
    curated_fields_preserved: summary.curated_fields_preserved || []
  },
  intelligence: {
    shorts: summary.shorts || {},
    playlists_discovered: summary.playlists_discovered ?? null,
    playlist_memberships: summary.playlist_memberships ?? null,
    transcript_availability: summary.transcript_availability ?? null,
    transcripts_processed: summary.transcripts_processed ?? null,
    explicit_resourcegrid_url_matches: summary.explicit_resourcegrid_url_matches ?? null,
    unmatched_urls: summary.unmatched_urls ?? null,
    relationship_evidence_breakdown: summary.relationship_evidence_breakdown || {}
  },
  promotion: {
    matched_entities_updated: promotion.matched_entities_updated ?? 0,
    new_entities_promoted: promotion.new_entities_promoted ?? 0,
    relationships_added: promotion.relationships_added ?? 0,
    relationships_evidence_updated: promotion.relationships_evidence_updated ?? 0,
    held_ambiguous_records: promotion.held_ambiguous_records ?? summary.ambiguous_records ?? 0,
    held_weak_relationship_candidates: promotion.held_weak_relationship_candidates ?? summary.held_relationship_changes ?? 0,
    shorts_moved_between_registries: promotion.shorts_moved_between_registries ?? 0,
    playlists_promoted_as_entities: promotion.playlists_promoted_as_entities ?? 0,
    full_transcripts_promoted: promotion.full_transcripts_promoted ?? 0
  },
  counts: {
    before,
    after,
    delta: {
      total_entities: delta(before.total_entities, after.total_entities),
      youtube_videos: delta(before.youtube_videos, after.youtube_videos),
      short_videos: delta(before.short_videos, after.short_videos),
      total_relationships: delta(before.total_relationships, after.total_relationships),
      content_to_content: delta(before.content_to_content, after.content_to_content),
      content_to_resources: delta(before.content_to_resources, after.content_to_resources),
      content_to_ctas: delta(before.content_to_ctas, after.content_to_ctas)
    }
  },
  commands: {
    'npm run registry:build': exits.registry_build,
    'npm run lint': exits.lint,
    'npm run build': exits.build
  },
  validation: {
    validation_report_valid: validation?.valid ?? null,
    validation_errors: validationErrors,
    unresolved_relationships: unresolvedRelationships,
    duplicate_canonical_ids: duplicateCanonicalIds,
    duplicate_relationship_ids: duplicateRelationshipIds,
    self_references: selfReferences,
    transcript_body_leaked_into_compiled_master: transcriptLeak,
    youtube_api_key_found_in_repo_outputs: apiKeyLeak,
    deduplication_report_present: Boolean(dedupe)
  },
  success: exits.registry_build === 0 && exits.lint === 0 && exits.build === 0 && validation?.valid === true && duplicateCanonicalIds === 0 && duplicateRelationshipIds === 0 && selfReferences === 0 && !transcriptLeak && !apiKeyLeak
};

writeJson(path.join(dirs.enrichment, 'final-report.json'), finalReport);
const enrichFile = path.join(dirs.enrichment, 'enrichment-report.json');
const enrich = fs.existsSync(enrichFile) ? readJson(enrichFile) : { batch: finalReport.batch, run_id: runId };
enrich.final = finalReport;
writeJson(enrichFile, enrich);
console.log(JSON.stringify(finalReport, null, 2));
