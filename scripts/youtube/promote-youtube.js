const fs = require('fs');
const path = require('path');
const {
  ROOT, readJson, writeJson, isoNow, parseArgs, ensureRunDirs, getLatestRunId,
  canonicalStateHashes, registryCounts, canonicalWatchUrl, canonicalEmbedUrl, getGitHead
} = require('./lib/common');

const args = parseArgs(process.argv.slice(2));
const runId = args.runId || getLatestRunId();
if (!runId) throw new Error('No --run-id supplied and no latest YouTube reconciliation run exists. Run Reconcile mode first.');
const dirs = ensureRunDirs(runId);
const planFile = path.join(dirs.reconciliation, 'promotion-plan.json');
const normalizedFile = path.join(dirs.normalized, 'videos.json');
if (!fs.existsSync(planFile)) throw new Error(`Missing promotion plan: ${planFile}`);
if (!fs.existsSync(normalizedFile)) throw new Error(`Missing normalized source file: ${normalizedFile}`);
const plan = readJson(planFile);
const normalized = readJson(normalizedFile);
if (plan.run_id !== runId) throw new Error('Promotion plan run_id mismatch.');

const currentHashes = canonicalStateHashes();
const stale = [];
for (const [file, expected] of Object.entries(plan.canonical_state_hashes || {})) {
  if ((currentHashes[file] || null) !== (expected || null)) stale.push({ file, expected, actual: currentHashes[file] || null });
}
if (stale.length) {
  writeJson(path.join(dirs.reconciliation, 'promotion-blocked-stale-state.json'), {
    batch: plan.batch,
    run_id: runId,
    blocked_at: isoNow(),
    reason: 'canonical_state_changed_since_reconciliation',
    stale_files: stale,
    instruction: 'Run Reconcile mode again against the current canonical state before promotion.'
  });
  throw new Error(`Promotion blocked: ${stale.length} canonical file(s) changed since reconciliation. Rerun Reconcile mode.`);
}

const countsBefore = registryCounts();
const videoRegistryFile = path.join(ROOT, 'registries', 'content', 'youtube-videos.json');
const registry = readJson(videoRegistryFile);
if (!Array.isArray(registry.resources)) throw new Error('youtube-videos.json does not contain a resources array.');
const sourceById = new Map((normalized.videos || []).map((v) => [v.youtube_video_id, v]));
const canonicalById = new Map(registry.resources.map((r) => [r.resource_id, r]));
const promotedFieldUpdates = [];
const newEntities = [];
const skippedNew = [];

// Existing matched records: source-owned refresh only. Curated fields are not assigned here.
for (const update of (plan.field_updates || [])) {
  if (!update.auto_promote) continue;
  const existing = canonicalById.get(update.resource_id);
  if (!existing) {
    promotedFieldUpdates.push({ resource_id: update.resource_id, status: 'skipped_missing_canonical_entity' });
    continue;
  }
  const desired = update.desired || {};
  const changed = [];
  for (const field of ['title','description','canonical_url','public_url','embed_url','published_at','last_verified_at']) {
    if (Object.prototype.hasOwnProperty.call(desired, field) && JSON.stringify(existing[field] ?? null) !== JSON.stringify(desired[field] ?? null)) {
      existing[field] = desired[field];
      changed.push(field);
    }
  }
  if (desired.source && JSON.stringify(existing.source || {}) !== JSON.stringify(desired.source)) {
    existing.source = desired.source;
    changed.push('source');
  }
  if (desired.metadata && JSON.stringify(existing.metadata || {}) !== JSON.stringify(desired.metadata)) {
    existing.metadata = desired.metadata;
    changed.push('metadata');
  }
  if (changed.length) promotedFieldUpdates.push({ resource_id: update.resource_id, youtube_video_id: update.youtube_video_id, status: 'updated', fields: changed });
}

// New videos: conservative canonical entities. Existing Shorts remain in youtube-videos.json for Batch 1.
for (const candidate of (plan.new_video_candidates || [])) {
  if (!candidate.auto_promote) continue;
  const src = sourceById.get(candidate.youtube_video_id);
  const rid = candidate.proposed_resource_id;
  if (!src || !rid) {
    skippedNew.push({ youtube_video_id: candidate.youtube_video_id, proposed_resource_id: rid || null, reason: 'missing_normalized_source_or_resource_id' });
    continue;
  }
  if (!src.title) {
    skippedNew.push({ youtube_video_id: src.youtube_video_id, proposed_resource_id: rid, reason: 'missing_source_title' });
    continue;
  }
  if (canonicalById.has(rid)) {
    skippedNew.push({ youtube_video_id: src.youtube_video_id, proposed_resource_id: rid, reason: 'resource_id_exists_at_promotion_time' });
    continue;
  }
  const sourceConfidence = src.acquisition?.youtube_api ? 1.0 : 0.99;
  const verifiedBy = src.acquisition?.youtube_api && src.acquisition?.ytdlp
    ? 'ResourceGrid YouTube API + yt-dlp ingestion'
    : (src.acquisition?.youtube_api ? 'ResourceGrid YouTube API ingestion' : 'ResourceGrid yt-dlp ingestion');
  const inferred = plan.inferred_clusters_for_new_videos?.[rid] || null;
  const isExplicitShort = src?.shorts_classification?.is_short === true;
  const entity = {
    resource_id: rid,
    entity_type: isExplicitShort ? 'short_video' : 'youtube_video',
    content_format: isExplicitShort ? 'short_video' : 'youtube_video',
    title: src.title,
    aliases: [],
    description: src.description ?? null,
    brand: 'Moonshine Capital',
    topics: [],
    content_clusters: inferred?.clusters || [],
    keywords: [],
    audiences: [],
    industries: [],
    search_intent: null,
    funnel_stage: null,
    primary_use_case: 'Video discovery, content repurposing, embedding, and related-content recommendation.',
    conversion_goal: null,
    priority: null,
    canonical_url: canonicalWatchUrl(src.youtube_video_id),
    public_url: canonicalWatchUrl(src.youtube_video_id),
    embed_url: canonicalEmbedUrl(src.youtube_video_id),
    repo_url: null,
    internal_url: null,
    public_access: true,
    status: 'published',
    last_verified_at: isoNow(),
    last_updated_at: null,
    notes: null,
    slug: src.youtube_video_id,
    excerpt: null,
    published_at: src.published_at ?? null,
    author: src.channel_title || 'Moonshine Capital TV',
    primary_keyword: null,
    secondary_keywords: [],
    recommended_resource_refs: [],
    recommended_cta_refs: [],
    internal_link_refs: [],
    source: {
      system: 'YouTube',
      source_id: src.youtube_video_id,
      source_file: null,
      source_url: canonicalWatchUrl(src.youtube_video_id),
      verified_by: verifiedBy,
      verified_at: isoNow(),
      confidence: sourceConfidence
    },
    metadata: {
      channel_id: src.channel_id || null,
      channel: src.channel_title || null,
      duration_seconds: src.duration_seconds ?? null,
      view_count: src.view_count ?? null,
      like_count: src.like_count ?? null,
      comment_count: src.comment_count ?? null,
      availability: src.availability ?? null,
      playlist_memberships: src.playlists || [],
      chapters: src.chapters || [],
      shorts_classification: src.shorts_classification || null,
      transcript_available: src.transcript?.available ?? null,
      transcript_processed: src.transcript?.processed ?? false,
      transcript_language: Array.isArray(src.transcript?.languages) ? src.transcript.languages : [],
      transcript_source: src.transcript?.source ?? null,
      transcript_path: src.transcript?.path ?? null,
      transcript_sha256: src.transcript?.sha256 ?? null,
      transcript_derived_terms: src.transcript_derived?.top_terms || [],
      youtube_description_url_count: (src.description_urls || []).length,
      youtube_ingestion_batch: 'youtube-v2-batch-1',
      youtube_ingestion_run: runId,
      youtube_ingestion_methods: [src.acquisition?.youtube_api ? 'youtube_data_api_v3' : null, src.acquisition?.ytdlp ? 'yt-dlp' : null].filter(Boolean),
      inferred_taxonomy: inferred ? { method: inferred.method, confidence: inferred.confidence, reference_resource_id: inferred.reference_resource_id, similarity: inferred.similarity } : null
    }
  };
  registry.resources.push(entity);
  canonicalById.set(rid, entity);
  newEntities.push({ resource_id: rid, youtube_video_id: src.youtube_video_id, title: src.title });
}

registry.resource_count = registry.resources.length;
if (Object.prototype.hasOwnProperty.call(registry, 'generated_date')) registry.generated_date = new Date().toISOString().slice(0, 10);
if (Object.prototype.hasOwnProperty.call(registry, 'generated_at')) registry.generated_at = isoNow();
writeJson(videoRegistryFile, registry);

// Relationship promotion: only plan rows explicitly marked auto_promote.
const relationFiles = new Map();
function getRelationDoc(relPath) {
  if (!relationFiles.has(relPath)) {
    const file = path.join(ROOT, relPath);
    const doc = readJson(file);
    if (!Array.isArray(doc.relationships)) throw new Error(`${relPath} does not contain a relationships array.`);
    relationFiles.set(relPath, { file, doc });
  }
  return relationFiles.get(relPath).doc;
}

const relationshipResults = [];
for (const proposal of (plan.proposed_relationships || [])) {
  if (!proposal.auto_promote) continue;
  const doc = getRelationDoc(proposal.relationship_file);
  if (proposal.action === 'update_evidence') {
    const rel = doc.relationships.find((r) => r.relationship_id === proposal.relationship_id);
    if (!rel) {
      relationshipResults.push({ relationship_id: proposal.relationship_id, action: proposal.action, status: 'skipped_missing_existing_relationship' });
      continue;
    }
    rel.context = proposal.context ?? rel.context ?? null;
    rel.weight = proposal.weight ?? rel.weight ?? null;
    rel.status = proposal.status || rel.status || 'active';
    rel.source = proposal.source || rel.source;
    rel.metadata = { ...(rel.metadata || {}), ...(proposal.metadata || {}) };
    relationshipResults.push({ relationship_id: rel.relationship_id, action: 'update_evidence', status: 'updated', evidence_class: proposal.evidence_class });
  } else if (proposal.action === 'add') {
    if (doc.relationships.some((r) => r.relationship_id === proposal.relationship_id)) {
      relationshipResults.push({ relationship_id: proposal.relationship_id, action: 'add', status: 'skipped_id_exists' });
      continue;
    }
    const duplicateLogical = doc.relationships.find((r) => r.source_id === proposal.source_id && r.relationship_type === proposal.relationship_type && r?.target?.resource_id === proposal?.target?.resource_id);
    if (duplicateLogical) {
      relationshipResults.push({ relationship_id: proposal.relationship_id, action: 'add', status: 'skipped_logical_edge_exists', existing_relationship_id: duplicateLogical.relationship_id });
      continue;
    }
    doc.relationships.push({
      relationship_id: proposal.relationship_id,
      source_id: proposal.source_id,
      relationship_type: proposal.relationship_type,
      target: proposal.target,
      context: proposal.context ?? null,
      weight: proposal.weight ?? null,
      status: proposal.status || 'active',
      source: proposal.source || { system: 'YouTube', source_file: null, verified_at: isoNow() },
      metadata: proposal.metadata || {}
    });
    relationshipResults.push({ relationship_id: proposal.relationship_id, action: 'add', status: 'added', evidence_class: proposal.evidence_class });
  }
}

for (const [relPath, { file, doc }] of relationFiles) {
  if (Object.prototype.hasOwnProperty.call(doc, 'relationship_count')) doc.relationship_count = doc.relationships.length;
  if (Object.prototype.hasOwnProperty.call(doc, 'generated_date')) doc.generated_date = new Date().toISOString().slice(0, 10);
  if (Object.prototype.hasOwnProperty.call(doc, 'generated_at')) doc.generated_at = isoNow();
  writeJson(file, doc);
}

const result = {
  batch: plan.batch,
  run_id: runId,
  promoted_at: isoNow(),
  repo_head: getGitHead(),
  counts_before_promotion: countsBefore,
  matched_entities_updated: promotedFieldUpdates.filter((x) => x.status === 'updated').length,
  field_update_results: promotedFieldUpdates,
  new_entities_promoted: newEntities.length,
  new_entities: newEntities,
  new_entities_skipped: skippedNew,
  relationships_added: relationshipResults.filter((x) => x.status === 'added').length,
  relationships_evidence_updated: relationshipResults.filter((x) => x.status === 'updated').length,
  relationship_results: relationshipResults,
  held_ambiguous_records: (plan.ambiguous_records || []).length,
  held_weak_relationship_candidates: (plan.proposed_relationships || []).filter((x) => !x.auto_promote).length,
  shorts_moved_between_registries: 0,
  playlists_promoted_as_entities: 0,
  unmatched_external_urls_promoted_as_entities: 0,
  full_transcripts_promoted: 0,
  counts_after_local_mutation_before_validation: registryCounts()
};
writeJson(path.join(dirs.reconciliation, 'promotion-result.json'), result);

const enrichFile = path.join(dirs.enrichment, 'enrichment-report.json');
const enrich = fs.existsSync(enrichFile) ? readJson(enrichFile) : { batch: plan.batch, run_id: runId };
enrich.promotion = result;
writeJson(enrichFile, enrich);
console.log(JSON.stringify(result, null, 2));
