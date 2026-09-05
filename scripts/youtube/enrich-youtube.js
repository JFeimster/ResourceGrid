const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  ROOT, readJson, writeJson, commandExists, isoNow, parseArgs, ensureRunDirs,
  extractYouTubeId, loadCanonicalEntities, loadRelationships, sha256File,
  parseVttToText, topTerms, extractHttpUrls
} = require('./lib/common');

const args = parseArgs(process.argv.slice(2));
const runId = args.runId;
if (!runId) throw new Error('Missing --run-id');
const dirs = ensureRunDirs(runId);
const normalizedFile = path.join(dirs.normalized, 'videos.json');
if (!fs.existsSync(normalizedFile)) throw new Error(`Missing normalized videos: ${normalizedFile}`);
const doc = readJson(normalizedFile);
const videos = doc.videos || [];
const hasYtDlp = commandExists('yt-dlp');
const requestedLimit = Number(args.transcriptLimit || process.env.YOUTUBE_TRANSCRIPT_LIMIT || 12);
const transcriptLimit = Number.isFinite(requestedLimit) ? Math.max(0, Math.min(100, Math.floor(requestedLimit))) : 12;
const transcriptDir = path.join(dirs.raw, 'transcripts');
fs.mkdirSync(transcriptDir, { recursive: true });

const canonical = loadCanonicalEntities();
const youtubeCanon = canonical.filter((e) => ['youtube_video','short_video'].includes(e.entity_type));
const canonByVideoId = new Map();
for (const e of youtubeCanon) {
  const id = e?.source?.source_id || extractYouTubeId(e.canonical_url) || extractYouTubeId(e.public_url);
  if (id) canonByVideoId.set(id, e);
}
const relationships = loadRelationships();
const relCount = new Map();
for (const rel of relationships) relCount.set(rel.source_id, (relCount.get(rel.source_id) || 0) + 1);

function score(v) {
  const c = canonByVideoId.get(v.youtube_video_id);
  let s = c ? Number(c.priority || 0) : 120;
  const descLen = (v.description || '').trim().length;
  if (descLen < 80) s += 35;
  if (v.transcript?.available === true) s += 20;
  if (c && (relCount.get(c.resource_id) || 0) < 2) s += 20;
  if (v.shorts_classification?.value === 'unknown') s += 5;
  return s;
}

const selected = [...videos]
  .sort((a, b) => score(b) - score(a) || String(a.youtube_video_id).localeCompare(String(b.youtube_video_id)))
  .slice(0, transcriptLimit);

const index = [];
let processed = 0;
let available = videos.filter((v) => v.transcript?.available === true).length;
let failed = 0;

function findVtt(videoId) {
  if (!fs.existsSync(transcriptDir)) return [];
  return fs.readdirSync(transcriptDir)
    .filter((f) => f.startsWith(`${videoId}.`) && f.toLowerCase().endsWith('.vtt'))
    .sort()
    .map((f) => path.join(transcriptDir, f));
}

for (const video of selected) {
  const id = video.youtube_video_id;
  const url = `https://www.youtube.com/watch?v=${id}`;
  const entry = { video_id: id, selected_score: score(video), attempted: false, available: video.transcript?.available ?? null, processed: false, files: [], error: null };

  let vttFiles = findVtt(id);
  if (!vttFiles.length && hasYtDlp) {
    entry.attempted = true;
    const output = path.join(transcriptDir, `${id}.%(language)s.%(ext)s`);
    const res = spawnSync('yt-dlp', [
      '--no-warnings', '--skip-download', '--write-subs', '--write-auto-subs',
      '--sub-langs', 'en.*,en', '--sub-format', 'vtt', '--output', output, url
    ], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 20, windowsHide: true });
    if (res.status !== 0) entry.error = (res.stderr || 'yt-dlp subtitle retrieval failed').trim().slice(0, 500);
    vttFiles = findVtt(id);
  }

  if (vttFiles.length) {
    entry.available = true;
    entry.processed = true;
    processed += 1;
    const wasAvailable = video.transcript?.available === true;
    if (!wasAvailable) available += 1;
    const combinedTexts = [];
    const transcriptFiles = [];
    for (const file of vttFiles) {
      const raw = fs.readFileSync(file, 'utf8');
      const text = parseVttToText(raw);
      if (text) combinedTexts.push(text);
      transcriptFiles.push({
        path: path.relative(ROOT, file),
        sha256: sha256File(file),
        bytes: fs.statSync(file).size
      });
    }
    const combined = combinedTexts.join(' ');
    const foundUrls = extractHttpUrls(combined);
    video.transcript = {
      ...(video.transcript || {}),
      available: true,
      processed: true,
      source: 'youtube_subtitles_or_auto_captions_via_ytdlp',
      path: transcriptFiles[0]?.path || null,
      sha256: transcriptFiles[0]?.sha256 || null,
      files: transcriptFiles,
      processed_at: isoNow()
    };
    video.transcript_derived = {
      word_count: combined ? combined.split(/\s+/).length : 0,
      top_terms: topTerms(combined, 20),
      urls: foundUrls.slice(0, 50)
    };
    entry.files = transcriptFiles;
    entry.word_count = video.transcript_derived.word_count;
    entry.derived_url_count = video.transcript_derived.urls.length;
  } else {
    if (entry.attempted && entry.error) failed += 1;
    video.transcript = { ...(video.transcript || {}), processed: false };
  }
  index.push(entry);
}

// Do not place transcript bodies in normalized JSON. Only provenance + derived compact intelligence are written.
doc.enriched_at = isoNow();
doc.transcript_processing = {
  ytdlp_available: hasYtDlp,
  requested_limit: transcriptLimit,
  selected_count: selected.length,
  transcript_available_count: available,
  transcript_processed_count: processed,
  failed_attempts: failed
};
writeJson(normalizedFile, doc);
writeJson(path.join(dirs.normalized, 'transcript-index.json'), {
  batch: 'youtube-v2-batch-1',
  run_id: runId,
  generated_at: isoNow(),
  ytdlp_available: hasYtDlp,
  requested_limit: transcriptLimit,
  entries: index
});

writeJson(path.join(dirs.enrichment, 'enrichment-report.json'), {
  batch: 'youtube-v2-batch-1',
  run_id: runId,
  generated_at: isoNow(),
  phase: 'pre-reconciliation-enrichment',
  source_videos_evaluated: videos.length,
  transcript_limit: transcriptLimit,
  transcript_candidates_selected: selected.length,
  transcript_available_count: available,
  transcript_processed_count: processed,
  transcript_failed_attempts: failed,
  full_transcript_bodies_promoted_to_canonical: false,
  raw_transcript_directory: path.relative(ROOT, transcriptDir),
  notes: [
    'Transcript bodies remain in inbox/raw staging.',
    'Normalized records contain only compact transcript provenance/hash/path plus derived terms/URLs.',
    'Canonical promotion may use derived intelligence but must not include transcript bodies.'
  ]
});
console.log(`Transcript enrichment selected ${selected.length}; processed ${processed}; yt-dlp available=${hasYtDlp}.`);
