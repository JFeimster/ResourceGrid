const fs = require('fs');
const path = require('path');
const {
  ROOT, readJson, writeJson, isoNow, parseArgs, ensureRunDirs, extractYouTubeId,
  canonicalWatchUrl, canonicalEmbedUrl, extractHttpUrls, parseIsoDuration
} = require('./lib/common');

const args = parseArgs(process.argv.slice(2));
const runId = args.runId;
if (!runId) throw new Error('Missing --run-id');
const dirs = ensureRunDirs(runId);
const rawManifestFile = path.join(dirs.raw, 'manifest.json');
if (!fs.existsSync(rawManifestFile)) throw new Error(`Missing raw manifest: ${rawManifestFile}`);
const manifest = readJson(rawManifestFile);
const apiDir = path.join(dirs.raw, 'api');
const ytdlpDir = path.join(dirs.raw, 'ytdlp');
const ytdlpVideosDir = path.join(ytdlpDir, 'videos');

function filesMatching(dir, re) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => path.join(dir, f));
}

const byId = new Map();
function ensure(id) {
  if (!id) return null;
  if (!byId.has(id)) {
    byId.set(id, {
      youtube_video_id: id,
      canonical_watch_url: canonicalWatchUrl(id),
      embed_url: canonicalEmbedUrl(id),
      title: null,
      description: null,
      published_at: null,
      channel_id: manifest.channel_id || null,
      channel_title: null,
      duration_seconds: null,
      view_count: null,
      like_count: null,
      comment_count: null,
      privacy_status: null,
      upload_status: null,
      availability: null,
      live_broadcast_content: null,
      playlists: [],
      chapters: [],
      description_urls: [],
      shorts_classification: { value: 'unknown', is_short: null, method: 'insufficient_evidence', confidence: 0 },
      transcript: { available: null, processed: false, languages: [], source: null, path: null, sha256: null },
      acquisition: { youtube_api: false, ytdlp: false, source_files: [] },
      metadata: {}
    });
  }
  return byId.get(id);
}

function addFile(rec, file) {
  const rel = path.relative(ROOT, file);
  if (!rec.acquisition.source_files.includes(rel)) rec.acquisition.source_files.push(rel);
}

// API video details.
for (const file of filesMatching(apiDir, /^video-details-\d+\.json$/)) {
  const payload = readJson(file);
  for (const item of (payload.items || [])) {
    const id = item.id;
    const rec = ensure(id);
    if (!rec) continue;
    const sn = item.snippet || {};
    const cd = item.contentDetails || {};
    const st = item.statistics || {};
    const status = item.status || {};
    rec.title = sn.title ?? rec.title;
    rec.description = sn.description ?? rec.description;
    rec.published_at = sn.publishedAt ?? rec.published_at;
    rec.channel_id = sn.channelId ?? rec.channel_id;
    rec.channel_title = sn.channelTitle ?? rec.channel_title;
    rec.duration_seconds = parseIsoDuration(cd.duration) ?? rec.duration_seconds;
    rec.view_count = st.viewCount !== undefined ? Number(st.viewCount) : rec.view_count;
    rec.like_count = st.likeCount !== undefined ? Number(st.likeCount) : rec.like_count;
    rec.comment_count = st.commentCount !== undefined ? Number(st.commentCount) : rec.comment_count;
    rec.privacy_status = status.privacyStatus ?? rec.privacy_status;
    rec.upload_status = status.uploadStatus ?? rec.upload_status;
    rec.live_broadcast_content = sn.liveBroadcastContent ?? rec.live_broadcast_content;
    rec.availability = status.privacyStatus || rec.availability;
    rec.metadata.category_id = sn.categoryId || null;
    rec.metadata.default_language = sn.defaultLanguage || sn.defaultAudioLanguage || null;
    rec.metadata.tags = Array.isArray(sn.tags) ? sn.tags : [];
    rec.metadata.thumbnails = sn.thumbnails || null;
    rec.acquisition.youtube_api = true;
    addFile(rec, file);
  }
}

// API upload playlist can fill records if videos.list omitted a deleted/private item.
for (const file of filesMatching(apiDir, /^uploads-playlist-items-page-\d+\.json$/)) {
  const payload = readJson(file);
  for (const item of (payload.items || [])) {
    const id = item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId;
    const rec = ensure(id);
    if (!rec) continue;
    const sn = item.snippet || {};
    if (!rec.title) rec.title = sn.title || null;
    if (!rec.published_at) rec.published_at = sn.publishedAt || null;
    rec.channel_id = sn.videoOwnerChannelId || sn.channelId || rec.channel_id;
    rec.channel_title = sn.videoOwnerChannelTitle || sn.channelTitle || rec.channel_title;
    addFile(rec, file);
  }
}

// API playlists + memberships.
const playlistInfo = new Map();
for (const file of filesMatching(apiDir, /^playlists-page-\d+\.json$/)) {
  const payload = readJson(file);
  for (const pl of (payload.items || [])) {
    playlistInfo.set(pl.id, {
      playlist_id: pl.id,
      title: pl?.snippet?.title || null,
      description: pl?.snippet?.description || null,
      published_at: pl?.snippet?.publishedAt || null,
      item_count: pl?.contentDetails?.itemCount ?? null,
      privacy_status: pl?.status?.privacyStatus || null,
      url: pl.id ? `https://www.youtube.com/playlist?list=${pl.id}` : null,
      source_file: path.relative(ROOT, file)
    });
  }
}

for (const file of filesMatching(apiDir, /^playlist-.+-items-page-\d+\.json$/)) {
  const payload = readJson(file);
  for (const item of (payload.items || [])) {
    const id = item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId;
    const playlistId = item?.snippet?.playlistId || null;
    const rec = ensure(id);
    if (!rec || !playlistId) continue;
    const info = playlistInfo.get(playlistId) || { playlist_id: playlistId, title: null, url: `https://www.youtube.com/playlist?list=${playlistId}` };
    if (!rec.playlists.some((p) => p.playlist_id === playlistId)) {
      rec.playlists.push({
        playlist_id: playlistId,
        playlist_title: info.title || null,
        playlist_url: info.url || null,
        position: Number.isInteger(item?.snippet?.position) ? item.snippet.position : null,
        evidence: 'youtube_api_playlist_items',
        source_file: path.relative(ROOT, file)
      });
    }
    addFile(rec, file);
  }
}

// yt-dlp channel flat inventory fallback.
for (const [filename, sourceSurface] of [['channel-videos-flat.json','videos_tab'], ['channel-shorts-flat.json','shorts_tab']]) {
  const file = path.join(ytdlpDir, filename);
  if (!fs.existsSync(file)) continue;
  const payload = readJson(file);
  for (const entry of (payload.entries || [])) {
    const id = extractYouTubeId(entry?.id) || extractYouTubeId(entry?.url) || (/^[A-Za-z0-9_-]{11}$/.test(String(entry?.id || '')) ? entry.id : null);
    const rec = ensure(id);
    if (!rec) continue;
    if (!rec.title) rec.title = entry.title || null;
    if (!rec.duration_seconds && Number.isFinite(entry.duration)) rec.duration_seconds = Math.round(entry.duration);
    rec.acquisition.ytdlp = true;
    rec.metadata.ytdlp_channel_surface = sourceSurface;
    if (sourceSurface === 'shorts_tab') {
      rec.shorts_classification = { value: 'short', is_short: true, method: 'official_channel_shorts_tab', confidence: 0.99 };
    }
    addFile(rec, file);
  }
}

// yt-dlp per-video metadata.
if (fs.existsSync(ytdlpVideosDir)) {
  for (const name of fs.readdirSync(ytdlpVideosDir).filter((f) => f.endsWith('.json')).sort()) {
    const file = path.join(ytdlpVideosDir, name);
    const item = readJson(file);
    const id = extractYouTubeId(item.id) || extractYouTubeId(item.webpage_url) || (/^[A-Za-z0-9_-]{11}$/.test(String(item.id || '')) ? item.id : null);
    const rec = ensure(id);
    if (!rec) continue;
    // API is authoritative when available. yt-dlp fills missing values and adds useful source detail.
    if (!rec.title) rec.title = item.title || item.fulltitle || null;
    if (!rec.description) rec.description = item.description || null;
    if (!rec.published_at) {
      if (item.timestamp) rec.published_at = new Date(Number(item.timestamp) * 1000).toISOString();
      else if (/^\d{8}$/.test(String(item.upload_date || ''))) {
        const d = String(item.upload_date);
        rec.published_at = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T00:00:00.000Z`;
      }
    }
    rec.channel_id = rec.channel_id || item.channel_id || item.uploader_id || null;
    rec.channel_title = rec.channel_title || item.channel || item.uploader || null;
    rec.duration_seconds = rec.duration_seconds ?? (Number.isFinite(item.duration) ? Math.round(item.duration) : null);
    rec.view_count = rec.view_count ?? (Number.isFinite(item.view_count) ? item.view_count : null);
    rec.like_count = rec.like_count ?? (Number.isFinite(item.like_count) ? item.like_count : null);
    rec.comment_count = rec.comment_count ?? (Number.isFinite(item.comment_count) ? item.comment_count : null);
    rec.availability = rec.availability || item.availability || null;
    rec.chapters = Array.isArray(item.chapters) ? item.chapters.map((c) => ({ start_time: c.start_time ?? null, end_time: c.end_time ?? null, title: c.title || null })) : rec.chapters;
    const langs = [...new Set([
      ...Object.keys(item.subtitles || {}),
      ...Object.keys(item.automatic_captions || {})
    ])];
    if (langs.length) {
      rec.transcript.available = true;
      rec.transcript.languages = langs;
      rec.transcript.source = Object.keys(item.subtitles || {}).length ? 'youtube_subtitles_via_ytdlp' : 'youtube_auto_captions_via_ytdlp';
    }
    if (String(item.webpage_url || item.original_url || '').includes('/shorts/')) {
      rec.shorts_classification = { value: 'short', is_short: true, method: 'explicit_shorts_url', confidence: 0.99 };
    }
    rec.metadata.ytdlp_format = item.format || null;
    rec.metadata.width = item.width ?? null;
    rec.metadata.height = item.height ?? null;
    rec.metadata.age_limit = item.age_limit ?? null;
    rec.acquisition.ytdlp = true;
    addFile(rec, file);
  }
}

// Explicit non-short evidence: Shorts cannot exceed 180 seconds under current public format rules.
for (const rec of byId.values()) {
  if (rec.shorts_classification.value === 'unknown' && Number.isFinite(rec.duration_seconds) && rec.duration_seconds > 180) {
    rec.shorts_classification = { value: 'video', is_short: false, method: 'duration_over_180_seconds', confidence: 0.99 };
  }
  rec.description_urls = extractHttpUrls(rec.description || '').map((url) => ({ original_url: url }));
  rec.playlists.sort((a, b) => String(a.playlist_id).localeCompare(String(b.playlist_id)) || (a.position ?? 999999) - (b.position ?? 999999));
  rec.acquisition.source_files.sort();
}

const discoveredIds = Array.isArray(manifest.discovered_video_ids) ? manifest.discovered_video_ids : [];
for (const id of discoveredIds) ensure(id);

const records = [...byId.values()].sort((a, b) => {
  const da = a.published_at || '';
  const db = b.published_at || '';
  return db.localeCompare(da) || a.youtube_video_id.localeCompare(b.youtube_video_id);
});

const normalized = {
  batch: 'youtube-v2-batch-1',
  run_id: runId,
  generated_at: isoNow(),
  repo_head: manifest.repo_head || null,
  channel_id: manifest.channel_id || null,
  acquisition: manifest.acquisition,
  discovery_exhaustive: Boolean(manifest.discovery_exhaustive),
  source_video_count: records.length,
  videos: records
};
writeJson(path.join(dirs.normalized, 'videos.json'), normalized);
writeJson(path.join(dirs.normalized, 'playlists.json'), {
  batch: normalized.batch,
  run_id: runId,
  generated_at: normalized.generated_at,
  playlist_count: playlistInfo.size,
  playlists: [...playlistInfo.values()].sort((a,b) => String(a.title || '').localeCompare(String(b.title || '')))
});
writeJson(path.join(dirs.normalized, 'manifest.json'), {
  batch: normalized.batch,
  run_id: runId,
  generated_at: normalized.generated_at,
  raw_manifest: path.relative(ROOT, rawManifestFile),
  source_video_count: records.length,
  playlist_count: playlistInfo.size,
  shorts_explicit: records.filter((r) => r.shorts_classification.is_short === true).length,
  shorts_non_short: records.filter((r) => r.shorts_classification.is_short === false).length,
  shorts_unknown: records.filter((r) => r.shorts_classification.is_short === null).length,
  videos_with_descriptions: records.filter((r) => Boolean(r.description)).length,
  videos_with_transcript_availability: records.filter((r) => r.transcript.available === true).length
});
console.log(`Normalized ${records.length} YouTube source records for run ${runId}.`);
