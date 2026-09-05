const fs = require('fs');
const path = require('path');
const {
  ROOT, readJson, writeJson, isoNow, parseArgs, ensureRunDirs, latestPointerFile,
  extractYouTubeId, canonicalWatchUrl, canonicalEmbedUrl, normalizeUrl, normalizeTitle,
  jaccard, loadCanonicalEntities, loadRelationships, buildUrlIndex, isYouTubeUrl,
  relationshipFileForTarget, targetFamily, stableRelationshipId, slug,
  registryCounts, canonicalStateHashes, getGitHead, sha256Text, parseVttToText
} = require('./lib/common');

const args = parseArgs(process.argv.slice(2));
const runId = args.runId;
if (!runId) throw new Error('Missing --run-id');
const dirs = ensureRunDirs(runId);
const normalizedFile = path.join(dirs.normalized, 'videos.json');
const playlistsFile = path.join(dirs.normalized, 'playlists.json');
const rawManifestFile = path.join(dirs.raw, 'manifest.json');
if (!fs.existsSync(normalizedFile)) throw new Error(`Missing normalized videos: ${normalizedFile}`);
if (!fs.existsSync(rawManifestFile)) throw new Error(`Missing raw manifest: ${rawManifestFile}`);
const normalized = readJson(normalizedFile);
const rawManifest = readJson(rawManifestFile);
const sourceVideos = normalized.videos || [];
const playlistDoc = fs.existsSync(playlistsFile) ? readJson(playlistsFile) : { playlists: [] };

const entities = loadCanonicalEntities();
const canonicalById = new Map(entities.map((e) => [e.resource_id, e]));
const canonicalVideos = entities.filter((e) => ['youtube_video','short_video'].includes(e.entity_type));
const relationships = loadRelationships();
const urlIndex = buildUrlIndex(entities);
const countsBefore = registryCounts();
const stateHashes = canonicalStateHashes();
const currentHead = getGitHead();
const generatedAt = isoNow();

const byVideoId = new Map();
const byWatchUrl = new Map();
const byNormalizedTitle = new Map();
for (const e of canonicalVideos) {
  const ids = new Set([
    e?.source?.source_id,
    extractYouTubeId(e?.canonical_url),
    extractYouTubeId(e?.public_url),
    extractYouTubeId(e?.embed_url),
    extractYouTubeId(e?.source?.source_url)
  ].filter(Boolean));
  for (const id of ids) {
    if (!byVideoId.has(id)) byVideoId.set(id, []);
    byVideoId.get(id).push(e);
  }
  for (const u of [e.canonical_url, e.public_url, e.embed_url, e?.source?.source_url]) {
    const n = normalizeUrl(u);
    if (!n) continue;
    if (!byWatchUrl.has(n)) byWatchUrl.set(n, []);
    byWatchUrl.get(n).push(e);
  }
  const nt = normalizeTitle(e.title);
  if (nt) {
    if (!byNormalizedTitle.has(nt)) byNormalizedTitle.set(nt, []);
    byNormalizedTitle.get(nt).push(e);
  }
}

function uniqueEntities(list) {
  const m = new Map();
  for (const e of (list || [])) if (e?.resource_id) m.set(e.resource_id, e);
  return [...m.values()];
}

function expectedResourceId(videoId) {
  return `youtube-${slug(videoId)}`;
}

function matchVideo(src) {
  const idMatches = uniqueEntities(byVideoId.get(src.youtube_video_id) || []);
  if (idMatches.length === 1) return { status: 'matched', entity: idMatches[0], match_method: 'youtube_video_id', confidence: 1.0, strong: true };
  if (idMatches.length > 1) return { status: 'ambiguous', candidates: idMatches, match_method: 'youtube_video_id_collision', confidence: 1.0, strong: false };

  const urlMatches = uniqueEntities(byWatchUrl.get(normalizeUrl(src.canonical_watch_url)) || []);
  if (urlMatches.length === 1) return { status: 'matched', entity: urlMatches[0], match_method: 'canonical_watch_url', confidence: 0.99, strong: true };
  if (urlMatches.length > 1) return { status: 'ambiguous', candidates: urlMatches, match_method: 'canonical_watch_url_collision', confidence: 0.99, strong: false };

  const rid = expectedResourceId(src.youtube_video_id);
  const ridEntity = canonicalById.get(rid);
  if (ridEntity && ['youtube_video','short_video'].includes(ridEntity.entity_type)) {
    return { status: 'matched', entity: ridEntity, match_method: 'existing_resource_id', confidence: 0.98, strong: true };
  }
  if (ridEntity) return { status: 'ambiguous', candidates: [ridEntity], match_method: 'resource_id_collision_other_type', confidence: 1.0, strong: false };

  const titleMatches = uniqueEntities(byNormalizedTitle.get(normalizeTitle(src.title)) || []);
  if (titleMatches.length) {
    return { status: 'ambiguous', candidates: titleMatches, match_method: 'exact_title_weak_evidence', confidence: titleMatches.length === 1 ? 0.78 : 0.6, strong: false };
  }

  // Fuzzy title is candidate evidence only; never an automatic match.
  const fuzzy = canonicalVideos
    .map((e) => ({ entity: e, score: jaccard(src.title || '', e.title || '') }))
    .filter((x) => x.score >= 0.75)
    .sort((a,b) => b.score - a.score)
    .slice(0, 5);
  if (fuzzy.length) return { status: 'ambiguous', candidates: fuzzy.map((x) => x.entity), fuzzy_scores: fuzzy.map((x) => ({ resource_id: x.entity.resource_id, score: x.score })), match_method: 'fuzzy_title_weak_evidence', confidence: fuzzy[0].score, strong: false };
  return { status: 'new', entity: null, match_method: 'no_existing_match', confidence: 1.0, strong: true };
}

const curatedFields = [
  'resource_id','topics','content_clusters','keywords','audiences','industries','search_intent','funnel_stage',
  'primary_use_case','conversion_goal','priority','recommended_resource_refs','recommended_cta_refs','internal_link_refs','notes'
];

function valueEqual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function proposedUpdates(src, existing) {
  const sourceConfidence = src.acquisition?.youtube_api ? 1.0 : 0.99;
  const verifiedBy = src.acquisition?.youtube_api && src.acquisition?.ytdlp
    ? 'ResourceGrid YouTube API + yt-dlp ingestion'
    : (src.acquisition?.youtube_api ? 'ResourceGrid YouTube API ingestion' : 'ResourceGrid yt-dlp ingestion');
  const desired = {
    title: src.title || existing.title,
    description: src.description ?? existing.description ?? null,
    canonical_url: canonicalWatchUrl(src.youtube_video_id),
    public_url: canonicalWatchUrl(src.youtube_video_id),
    embed_url: canonicalEmbedUrl(src.youtube_video_id),
    published_at: src.published_at ?? existing.published_at ?? null,
    last_verified_at: generatedAt,
    source: {
      ...(existing.source || {}),
      system: 'YouTube',
      source_id: src.youtube_video_id,
      source_url: canonicalWatchUrl(src.youtube_video_id),
      verified_by: verifiedBy,
      verified_at: generatedAt,
      confidence: sourceConfidence
    },
    metadata: {
      ...(existing.metadata || {}),
      channel_id: src.channel_id ?? existing?.metadata?.channel_id ?? null,
      channel: src.channel_title ?? existing?.metadata?.channel ?? null,
      duration_seconds: src.duration_seconds ?? existing?.metadata?.duration_seconds ?? null,
      view_count: src.view_count ?? existing?.metadata?.view_count ?? null,
      like_count: src.like_count ?? existing?.metadata?.like_count ?? null,
      comment_count: src.comment_count ?? existing?.metadata?.comment_count ?? null,
      availability: src.availability ?? existing?.metadata?.availability ?? null,
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
      youtube_ingestion_methods: [src.acquisition?.youtube_api ? 'youtube_data_api_v3' : null, src.acquisition?.ytdlp ? 'yt-dlp' : null].filter(Boolean)
    }
  };
  const changes = [];
  for (const field of ['title','description','canonical_url','public_url','embed_url','published_at','last_verified_at','source','metadata']) {
    if (!valueEqual(existing[field], desired[field])) changes.push({ field, from: existing[field] ?? null, to: desired[field] ?? null });
  }
  return { desired, changes, curated_fields_preserved: curatedFields.filter((f) => Object.prototype.hasOwnProperty.call(existing, f)) };
}

const matchRows = [];
const newRows = [];
const ambiguousRows = [];
const duplicateCandidates = [];
const fieldUpdates = [];
const sourceIdToResourceId = new Map();
const newResourceIds = new Set();

for (const src of sourceVideos) {
  const m = matchVideo(src);
  const base = { youtube_video_id: src.youtube_video_id, source_title: src.title || null, match_method: m.match_method, confidence: m.confidence };
  if (m.status === 'matched') {
    sourceIdToResourceId.set(src.youtube_video_id, m.entity.resource_id);
    const proposed = proposedUpdates(src, m.entity);
    matchRows.push({ ...base, status: 'matched', resource_id: m.entity.resource_id, canonical_title: m.entity.title, registry_file: m.entity._registry_file, strong_match: true });
    fieldUpdates.push({ youtube_video_id: src.youtube_video_id, resource_id: m.entity.resource_id, changes: proposed.changes, curated_fields_preserved: proposed.curated_fields_preserved, auto_promote: true, desired: proposed.desired });
  } else if (m.status === 'new') {
    const rid = expectedResourceId(src.youtube_video_id);
    if (canonicalById.has(rid) || newResourceIds.has(rid)) {
      duplicateCandidates.push({ ...base, proposed_resource_id: rid, reason: 'generated_resource_id_collision' });
      ambiguousRows.push({ ...base, status: 'held', proposed_resource_id: rid, reason: 'generated_resource_id_collision' });
      continue;
    }
    newResourceIds.add(rid);
    sourceIdToResourceId.set(src.youtube_video_id, rid);
    newRows.push({ ...base, status: 'new', proposed_resource_id: rid, auto_promote: true });
  } else {
    ambiguousRows.push({ ...base, status: 'held', candidates: (m.candidates || []).map((e) => ({ resource_id: e.resource_id, title: e.title, entity_type: e.entity_type, registry_file: e._registry_file })), fuzzy_scores: m.fuzzy_scores || null, reason: m.match_method });
  }
}

// Duplicate source IDs in normalized input.
const seenSource = new Set();
for (const src of sourceVideos) {
  if (seenSource.has(src.youtube_video_id)) duplicateCandidates.push({ youtube_video_id: src.youtube_video_id, reason: 'duplicate_source_video_id_in_normalized_input' });
  seenSource.add(src.youtube_video_id);
}

// Source videos absent from current discovery are held as unavailable/deleted/private candidates only.
const discovered = new Set(sourceVideos.map((v) => v.youtube_video_id));
const unavailable = [];
if (normalized.discovery_exhaustive) {
  for (const e of canonicalVideos) {
    const id = e?.source?.source_id || extractYouTubeId(e.canonical_url) || extractYouTubeId(e.public_url);
    if (id && !discovered.has(id)) unavailable.push({ resource_id: e.resource_id, youtube_video_id: id, title: e.title, status: 'not_discovered_in_current_exhaustive_inventory', canonical_mutation: false });
  }
}

// Shorts report — classification only; no registry movement in Batch 1.
const shortsRows = sourceVideos.map((v) => ({
  youtube_video_id: v.youtube_video_id,
  resource_id: sourceIdToResourceId.get(v.youtube_video_id) || null,
  title: v.title || null,
  classification: v.shorts_classification || { value: 'unknown', is_short: null, method: 'insufficient_evidence', confidence: 0 },
  canonical_registry_action: 'preserve_existing_registry_location'
}));

// URL resolution.
const descriptionUrlMatches = [];
const unmatchedUrls = [];
const resolvedUrlEvidence = [];
for (const src of sourceVideos) {
  const sourceResourceId = sourceIdToResourceId.get(src.youtube_video_id);
  if (!sourceResourceId) continue;
  for (const item of (src.description_urls || [])) {
    const original = item.original_url;
    const normalizedUrl = normalizeUrl(original);
    if (!normalizedUrl) {
      unmatchedUrls.push({ youtube_video_id: src.youtube_video_id, source_resource_id: sourceResourceId, original_url: original, classification: 'malformed_or_unsupported' });
      continue;
    }
    const hits = urlIndex.get(normalizedUrl) || [];
    const uniqueHits = [...new Map(hits.map((h) => [h.resource_id, h])).values()].filter((h) => h.resource_id !== sourceResourceId);
    if (uniqueHits.length === 1) {
      const hit = uniqueHits[0];
      const row = { youtube_video_id: src.youtube_video_id, source_resource_id: sourceResourceId, original_url: original, normalized_url: normalizedUrl, classification: 'resolved_resourcegrid_entity', target: hit };
      descriptionUrlMatches.push(row);
      resolvedUrlEvidence.push(row);
    } else if (uniqueHits.length > 1) {
      unmatchedUrls.push({ youtube_video_id: src.youtube_video_id, source_resource_id: sourceResourceId, original_url: original, normalized_url: normalizedUrl, classification: 'ambiguous_resourcegrid_url', candidates: uniqueHits });
    } else if (isYouTubeUrl(original)) {
      unmatchedUrls.push({ youtube_video_id: src.youtube_video_id, source_resource_id: sourceResourceId, original_url: original, normalized_url: normalizedUrl, classification: 'youtube_internal' });
    } else {
      unmatchedUrls.push({ youtube_video_id: src.youtube_video_id, source_resource_id: sourceResourceId, original_url: original, normalized_url: normalizedUrl, classification: 'external_unmatched' });
    }
  }
}

// Evidence ranking.
const evidenceRank = { official_playlist: 5, explicit_description_url: 4, exact_stable_id: 3, exact_url: 3, exact_title: 3, transcript_reference: 2, taxonomy_cluster: 1 };
const existingIds = new Set(relationships.map((r) => r.relationship_id));
const existingEdge = new Map();
for (const rel of relationships) {
  const targetId = rel?.target?.resource_id;
  if (!targetId) continue;
  existingEdge.set(`${rel.source_id}|${rel.relationship_type}|${targetId}`, rel);
}
const relationProposals = [];
const proposalKey = new Map();

function proposeRelation({ sourceId, targetId, targetType, type, evidenceClass, confidence, context, metadata = {}, fileOverride = null }) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const file = fileOverride || relationshipFileForTarget(targetType);
  const key = `${sourceId}|${type}|${targetId}`;
  const existing = existingEdge.get(key);
  const proposedMeta = {
    evidence_class: evidenceClass,
    evidence_rank: evidenceRank[evidenceClass] || 0,
    match_method: metadata.match_method || evidenceClass,
    confidence,
    source_system: 'YouTube',
    ingestion_batch: 'youtube-v2-batch-1',
    ingestion_run: runId,
    ...metadata
  };
  const autoPromote = confidence >= 0.9 && ['official_playlist','explicit_description_url','exact_stable_id','exact_url','exact_title'].includes(evidenceClass);
  if (existing) {
    const oldRank = Number(existing?.metadata?.evidence_rank || evidenceRank[existing?.metadata?.evidence_class] || 0);
    if ((evidenceRank[evidenceClass] || 0) <= oldRank) return;
    const row = {
      action: 'update_evidence',
      relationship_file: existing._relationship_file || file,
      relationship_id: existing.relationship_id,
      source_id: sourceId,
      relationship_type: type,
      target: { resource_id: targetId },
      context: context || existing.context || null,
      weight: confidence,
      status: existing.status || 'active',
      source: existing.source || { system: 'YouTube', source_file: null, verified_at: generatedAt },
      metadata: { ...(existing.metadata || {}), ...proposedMeta },
      evidence_class: evidenceClass,
      confidence,
      auto_promote: autoPromote,
      prior_evidence_class: existing?.metadata?.evidence_class || null
    };
    proposalKey.set(key, row);
    return;
  }
  const current = proposalKey.get(key);
  if (current && (evidenceRank[current.evidence_class] || 0) >= (evidenceRank[evidenceClass] || 0)) return;
  const relationshipId = stableRelationshipId(sourceId, type, targetId, existingIds);
  existingIds.add(relationshipId);
  proposalKey.set(key, {
    action: 'add',
    relationship_file: file,
    relationship_id: relationshipId,
    source_id: sourceId,
    relationship_type: type,
    target: { resource_id: targetId },
    context: context || null,
    weight: confidence,
    status: 'active',
    source: { system: 'YouTube', source_file: null, verified_at: generatedAt },
    metadata: proposedMeta,
    evidence_class: evidenceClass,
    confidence,
    auto_promote: autoPromote
  });
}

// Explicit description URLs.
for (const row of resolvedUrlEvidence) {
  const targetEntity = canonicalById.get(row.target.resource_id);
  if (!targetEntity) continue;
  const fam = targetFamily(targetEntity.entity_type);
  proposeRelation({
    sourceId: row.source_resource_id,
    targetId: targetEntity.resource_id,
    targetType: targetEntity.entity_type,
    type: fam === 'cta' ? 'promotes' : 'references',
    evidenceClass: 'explicit_description_url',
    confidence: 1.0,
    context: 'Explicit URL in published YouTube description.',
    metadata: { match_method: row.target.field || 'canonical_url', evidence_url: row.original_url, normalized_evidence_url: row.normalized_url, source_video_id: row.youtube_video_id }
  });
}

// Official playlist adjacency: bounded to +/-2 positions to avoid clique explosion.
const playlistMembers = new Map();
for (const src of sourceVideos) {
  const rid = sourceIdToResourceId.get(src.youtube_video_id);
  if (!rid) continue;
  for (const p of (src.playlists || [])) {
    if (!playlistMembers.has(p.playlist_id)) playlistMembers.set(p.playlist_id, []);
    playlistMembers.get(p.playlist_id).push({ rid, videoId: src.youtube_video_id, pos: Number.isInteger(p.position) ? p.position : 999999, title: src.title, playlist: p });
  }
}
for (const [playlistId, members] of playlistMembers) {
  members.sort((a,b) => a.pos - b.pos || a.videoId.localeCompare(b.videoId));
  for (let i = 0; i < members.length; i++) {
    for (const offset of [-2,-1,1,2]) {
      const j = i + offset;
      if (j < 0 || j >= members.length) continue;
      const a = members[i], b = members[j];
      proposeRelation({
        sourceId: a.rid,
        targetId: b.rid,
        targetType: 'youtube_video',
        type: 'related_to',
        evidenceClass: 'official_playlist',
        confidence: 0.95,
        context: `Official YouTube playlist membership${a.playlist.playlist_title ? `: ${a.playlist.playlist_title}` : ''}.`,
        metadata: { playlist_id: playlistId, playlist_title: a.playlist.playlist_title || null, source_video_id: a.videoId, source_position: a.pos, target_position: b.pos }
      });
    }
  }
}

// Exact canonical title mentions in published descriptions — stable deterministic evidence, but only sufficiently specific titles.
const titleCandidates = entities.filter((e) => e.title && normalizeTitle(e.title).split(' ').length >= 3 && normalizeTitle(e.title).length >= 18);
for (const src of sourceVideos) {
  const rid = sourceIdToResourceId.get(src.youtube_video_id);
  if (!rid || !src.description) continue;
  const hay = ` ${normalizeTitle(src.description)} `;
  let found = 0;
  for (const target of titleCandidates) {
    if (target.resource_id === rid) continue;
    const needle = normalizeTitle(target.title);
    if (needle && hay.includes(` ${needle} `)) {
      const fam = targetFamily(target.entity_type);
      proposeRelation({ sourceId: rid, targetId: target.resource_id, targetType: target.entity_type, type: fam === 'cta' ? 'promotes' : 'references', evidenceClass: 'exact_title', confidence: 0.92, context: 'Exact canonical ResourceGrid title mentioned in published YouTube description.', metadata: { matched_title: target.title, source_video_id: src.youtube_video_id } });
      if (++found >= 5) break;
    }
  }
}

// Transcript exact-title evidence — proposed/held by default (confidence below auto-promotion threshold).
for (const src of sourceVideos) {
  const rid = sourceIdToResourceId.get(src.youtube_video_id);
  const transcriptPath = src.transcript?.path ? path.join(ROOT, src.transcript.path) : null;
  if (!rid || !transcriptPath || !fs.existsSync(transcriptPath)) continue;
  const transcriptText = parseVttToText(fs.readFileSync(transcriptPath, 'utf8'));
  const hay = ` ${normalizeTitle(transcriptText)} `;
  let found = 0;
  for (const target of titleCandidates) {
    if (target.resource_id === rid) continue;
    const needle = normalizeTitle(target.title);
    if (needle && hay.includes(` ${needle} `)) {
      proposeRelation({ sourceId: rid, targetId: target.resource_id, targetType: target.entity_type, type: targetFamily(target.entity_type) === 'cta' ? 'promotes' : 'references', evidenceClass: 'transcript_reference', confidence: 0.8, context: 'Exact canonical ResourceGrid title detected in selectively processed transcript.', metadata: { matched_title: target.title, source_video_id: src.youtube_video_id, transcript_sha256: src.transcript.sha256 || null } });
      if (++found >= 5) break;
    }
  }
}

// Cluster inference for genuinely new videos only. Never overwrite curated clusters on existing videos.
const canonicalYoutubeWithClusters = canonicalVideos.filter((e) => Array.isArray(e.content_clusters) && e.content_clusters.length);
const inferredClusters = new Map();
for (const row of newRows) {
  const src = sourceVideos.find((v) => v.youtube_video_id === row.youtube_video_id);
  if (!src) continue;
  const srcText = `${src.title || ''} ${src.description || ''}`;
  const nearest = canonicalYoutubeWithClusters
    .map((e) => ({ e, score: jaccard(srcText, `${e.title || ''} ${e.description || ''}`) }))
    .filter((x) => x.score >= 0.18)
    .sort((a,b) => b.score - a.score)[0];
  if (nearest) {
    const value = { clusters: [...nearest.e.content_clusters], confidence: Math.min(0.75, 0.45 + nearest.score), method: 'nearest_canonical_youtube_taxonomy', reference_resource_id: nearest.e.resource_id, similarity: nearest.score };
    inferredClusters.set(row.proposed_resource_id, value);
    row.inferred_content_clusters = value;
  }
}

// Low-confidence taxonomy relationship candidates for new videos, held for later review.
const existingSourceClusters = new Map();
for (const e of entities) for (const c of (e.content_clusters || [])) {
  if (!existingSourceClusters.has(c)) existingSourceClusters.set(c, []);
  existingSourceClusters.get(c).push(e.resource_id);
}
const outgoingBySource = new Map();
for (const rel of relationships) {
  if (!outgoingBySource.has(rel.source_id)) outgoingBySource.set(rel.source_id, []);
  outgoingBySource.get(rel.source_id).push(rel);
}
for (const row of newRows) {
  const inferred = inferredClusters.get(row.proposed_resource_id);
  if (!inferred) continue;
  const src = sourceVideos.find((v) => v.youtube_video_id === row.youtube_video_id);
  const clusterSources = new Set(inferred.clusters.flatMap((c) => existingSourceClusters.get(c) || []));
  const targetFreq = new Map();
  for (const sid of clusterSources) {
    for (const rel of (outgoingBySource.get(sid) || [])) {
      const tid = rel?.target?.resource_id;
      if (!tid) continue;
      targetFreq.set(tid, (targetFreq.get(tid) || 0) + 1);
    }
  }
  const byFam = { content: [], resource: [], cta: [] };
  for (const [tid, freq] of targetFreq) {
    const target = canonicalById.get(tid);
    if (!target) continue;
    byFam[targetFamily(target.entity_type)].push({ target, freq });
  }
  for (const fam of ['content','resource','cta']) {
    const best = byFam[fam].sort((a,b) => b.freq - a.freq || String(a.target.title).localeCompare(String(b.target.title)))[0];
    if (!best) continue;
    proposeRelation({
      sourceId: row.proposed_resource_id,
      targetId: best.target.resource_id,
      targetType: best.target.entity_type,
      type: fam === 'cta' ? 'promotes' : 'related_to',
      evidenceClass: 'taxonomy_cluster',
      confidence: 0.55,
      context: 'Deterministic cluster-based candidate for a new YouTube video; held from auto-promotion.',
      metadata: { inferred_clusters: inferred.clusters, supporting_existing_edge_count: best.freq, source_video_id: src.youtube_video_id }
    });
  }
}

relationProposals.push(...proposalKey.values());
relationProposals.sort((a,b) => (evidenceRank[b.evidence_class] || 0) - (evidenceRank[a.evidence_class] || 0) || b.confidence - a.confidence || a.relationship_id.localeCompare(b.relationship_id));

const transcriptIndexFile = path.join(dirs.normalized, 'transcript-index.json');
const transcriptIndex = fs.existsSync(transcriptIndexFile) ? readJson(transcriptIndexFile) : { entries: [] };
const playlistMembershipCount = sourceVideos.reduce((n, v) => n + (v.playlists || []).length, 0);

const plan = {
  batch: 'youtube-v2-batch-1',
  run_id: runId,
  generated_at: generatedAt,
  input_repo_head: currentHead,
  raw_inventory_repo_head: rawManifest.repo_head || null,
  canonical_state_hashes: stateHashes,
  counts_before: countsBefore,
  acquisition: rawManifest.acquisition || {},
  discovery_exhaustive: Boolean(normalized.discovery_exhaustive),
  matches: matchRows,
  new_video_candidates: newRows,
  ambiguous_records: ambiguousRows,
  duplicate_candidates: duplicateCandidates,
  unavailable_candidates: unavailable,
  field_updates: fieldUpdates,
  shorts_classification: shortsRows,
  playlists: playlistDoc.playlists || [],
  playlist_membership_count: playlistMembershipCount,
  description_url_matches: descriptionUrlMatches,
  unmatched_urls: unmatchedUrls,
  transcript_entries: transcriptIndex.entries || [],
  proposed_relationships: relationProposals,
  inferred_clusters_for_new_videos: Object.fromEntries(inferredClusters),
  promotion_policy: {
    strong_match_order: ['youtube_video_id','canonical_watch_url','existing_resource_id','title_only_weak'],
    preserve_curated_fields: curatedFields,
    auto_promote_relationship_evidence: ['official_playlist','explicit_description_url','exact_stable_id','exact_url','exact_title'],
    hold_relationship_evidence: ['transcript_reference','taxonomy_cluster'],
    move_existing_shorts_between_registries: false,
    promote_playlists_as_entities: false,
    promote_unmatched_external_urls: false
  }
};

const summary = {
  batch: plan.batch,
  run_id: runId,
  generated_at: generatedAt,
  input_repo_head: currentHead,
  acquisition: plan.acquisition,
  canonical_counts_before: countsBefore,
  source_videos_discovered: sourceVideos.length,
  existing_canonical_matches: matchRows.length,
  genuinely_new_videos: newRows.length,
  unavailable_deleted_private_candidates: unavailable.length,
  ambiguous_records: ambiguousRows.length,
  duplicate_candidates: duplicateCandidates.length,
  matched_entities_with_field_updates: fieldUpdates.filter((x) => x.changes.length).length,
  fields_proposed_for_update: fieldUpdates.reduce((n, x) => n + x.changes.length, 0),
  curated_fields_preserved: curatedFields,
  shorts: {
    short: shortsRows.filter((r) => r.classification?.is_short === true).length,
    non_short: shortsRows.filter((r) => r.classification?.is_short === false).length,
    unknown: shortsRows.filter((r) => r.classification?.is_short === null).length
  },
  playlists_discovered: (playlistDoc.playlists || []).length,
  playlist_memberships: playlistMembershipCount,
  transcript_availability: sourceVideos.filter((v) => v.transcript?.available === true).length,
  transcripts_processed: sourceVideos.filter((v) => v.transcript?.processed === true).length,
  explicit_resourcegrid_url_matches: descriptionUrlMatches.length,
  unmatched_urls: unmatchedUrls.length,
  proposed_relationship_additions: relationProposals.filter((r) => r.action === 'add').length,
  proposed_relationship_evidence_updates: relationProposals.filter((r) => r.action === 'update_evidence').length,
  auto_promotable_relationship_changes: relationProposals.filter((r) => r.auto_promote).length,
  held_relationship_changes: relationProposals.filter((r) => !r.auto_promote).length,
  relationship_evidence_breakdown: Object.fromEntries([...new Set(relationProposals.map((r) => r.evidence_class))].sort().map((k) => [k, relationProposals.filter((r) => r.evidence_class === k).length])),
  canonical_mutation_performed: false,
  reconciliation_plan_sha256: null
};

const planFile = path.join(dirs.reconciliation, 'promotion-plan.json');
writeJson(planFile, plan);
summary.reconciliation_plan_sha256 = sha256Text(fs.readFileSync(planFile, 'utf8'));
writeJson(path.join(dirs.reconciliation, 'summary.json'), summary);
writeJson(path.join(dirs.reconciliation, 'video-matches.json'), { batch: plan.batch, run_id: runId, generated_at: generatedAt, matches: matchRows });
writeJson(path.join(dirs.reconciliation, 'new-video-candidates.json'), { batch: plan.batch, run_id: runId, generated_at: generatedAt, candidates: newRows });
writeJson(path.join(dirs.reconciliation, 'field-updates.json'), { batch: plan.batch, run_id: runId, generated_at: generatedAt, updates: fieldUpdates });
writeJson(path.join(dirs.reconciliation, 'ambiguous-records.json'), { batch: plan.batch, run_id: runId, generated_at: generatedAt, records: ambiguousRows, unavailable_candidates: unavailable });
writeJson(path.join(dirs.reconciliation, 'duplicate-candidates.json'), { batch: plan.batch, run_id: runId, generated_at: generatedAt, candidates: duplicateCandidates });
writeJson(path.join(dirs.reconciliation, 'shorts-classification.json'), { batch: plan.batch, run_id: runId, generated_at: generatedAt, rows: shortsRows, policy: 'classification_only_preserve_existing_registry_location' });
writeJson(path.join(dirs.reconciliation, 'playlists.json'), { batch: plan.batch, run_id: runId, generated_at: generatedAt, playlists: playlistDoc.playlists || [], membership_count: playlistMembershipCount });
writeJson(path.join(dirs.reconciliation, 'transcripts.json'), { batch: plan.batch, run_id: runId, generated_at: generatedAt, entries: transcriptIndex.entries || [] });
writeJson(path.join(dirs.reconciliation, 'description-url-matches.json'), { batch: plan.batch, run_id: runId, generated_at: generatedAt, matches: descriptionUrlMatches });
writeJson(path.join(dirs.reconciliation, 'unmatched-urls.json'), { batch: plan.batch, run_id: runId, generated_at: generatedAt, urls: unmatchedUrls });
writeJson(path.join(dirs.reconciliation, 'proposed-relationships.json'), { batch: plan.batch, run_id: runId, generated_at: generatedAt, relationships: relationProposals });
writeJson(latestPointerFile(), { batch: plan.batch, run_id: runId, updated_at: generatedAt, promotion_plan: path.relative(ROOT, planFile), input_repo_head: currentHead });

// Append reconciliation summary to enrichment report without touching canonical files.
const enrichFile = path.join(dirs.enrichment, 'enrichment-report.json');
const enrich = fs.existsSync(enrichFile) ? readJson(enrichFile) : { batch: plan.batch, run_id: runId, generated_at: generatedAt };
enrich.reconciliation = summary;
enrich.relationship_evidence_priority = ['official_playlist/source evidence','explicit description URLs','exact stable-ID/URL/title evidence','transcript evidence','taxonomy/cluster inference'];
writeJson(enrichFile, enrich);

console.log(JSON.stringify(summary, null, 2));
