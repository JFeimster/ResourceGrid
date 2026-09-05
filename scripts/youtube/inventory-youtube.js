const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  ROOT, readJson, writeJson, commandExists, getGitHead, getGitBranch, isoNow,
  parseArgs, ensureRunDirs, extractYouTubeId
} = require('./lib/common');

const args = parseArgs(process.argv.slice(2));
const runId = args.runId;
if (!runId) throw new Error('Missing --run-id');
const dirs = ensureRunDirs(runId);

const sourceDefFile = path.join(ROOT, 'sources', 'youtube.json');
const registryFile = path.join(ROOT, 'registries', 'content', 'youtube-videos.json');
const sourceDef = readJson(sourceDefFile);
const registry = readJson(registryFile);
const canonicalResources = Array.isArray(registry.resources) ? registry.resources : [];
const canonicalChannelId = registry.channel_id || canonicalResources.find((r) => r?.metadata?.channel_id)?.metadata?.channel_id || null;
const channelId = process.env.YOUTUBE_CHANNEL_ID || canonicalChannelId || 'UCaIYI3gwHxd-txPkCSkkPfQ';
const channelUrl = process.env.YOUTUBE_CHANNEL_URL || 'https://youtube.com/@moonshinecapitaltv';
const apiKey = process.env.YOUTUBE_API_KEY || null;
const hasYtDlp = commandExists('yt-dlp');
const apiAvailable = Boolean(apiKey);

if (!apiAvailable && !hasYtDlp) {
  throw new Error('Neither YOUTUBE_API_KEY nor yt-dlp is available. Configure one acquisition path and rerun Reconcile mode. No canonical files were changed.');
}

const apiDir = path.join(dirs.raw, 'api');
const ytdlpDir = path.join(dirs.raw, 'ytdlp');
const ytdlpVideosDir = path.join(ytdlpDir, 'videos');
for (const d of [apiDir, ytdlpDir, ytdlpVideosDir]) fs.mkdirSync(d, { recursive: true });

const manifest = {
  batch: 'youtube-v2-batch-1',
  run_id: runId,
  started_at: isoNow(),
  repo_head: getGitHead(),
  branch: getGitBranch(),
  channel_id: channelId,
  channel_url: channelUrl,
  source_definition: path.relative(ROOT, sourceDefFile),
  acquisition: {
    youtube_api_available: apiAvailable,
    youtube_api_used: false,
    ytdlp_available: hasYtDlp,
    ytdlp_used: false,
    ytdlp_metadata_limit: null
  },
  files: { api: [], ytdlp: [] },
  counts: {},
  warnings: []
};

function saveRawText(kind, filename, text) {
  const base = kind === 'api' ? apiDir : ytdlpDir;
  const file = path.join(base, filename);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
  const rel = path.relative(ROOT, file);
  manifest.files[kind].push(rel);
  return file;
}

async function youtubeApi(endpoint, params, filename) {
  const u = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined) u.searchParams.set(k, String(v));
  u.searchParams.set('key', apiKey);
  const res = await fetch(u, { headers: { 'Accept': 'application/json' } });
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { raw_text: text }; }
  if (!res.ok) {
    saveRawText('api', filename.replace(/\.json$/, '-error.json'), text);
    throw new Error(`YouTube API ${endpoint} failed with HTTP ${res.status}`);
  }
  saveRawText('api', filename, text);
  return payload;
}

async function paginateApi(endpoint, baseParams, prefix) {
  const out = [];
  let token = null;
  let page = 1;
  do {
    const payload = await youtubeApi(endpoint, { ...baseParams, pageToken: token }, `${prefix}-page-${String(page).padStart(3, '0')}.json`);
    out.push(payload);
    token = payload.nextPageToken || null;
    page += 1;
  } while (token);
  return out;
}

function runYtDlpJson(url, filename, extraArgs = []) {
  const result = spawnSync('yt-dlp', ['--no-warnings', '--dump-single-json', ...extraArgs, url], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 100, windowsHide: true
  });
  if (result.status !== 0) {
    manifest.warnings.push(`yt-dlp failed for ${url}: ${(result.stderr || '').trim().slice(0, 500)}`);
    return null;
  }
  let payload;
  try { payload = JSON.parse(result.stdout); }
  catch {
    manifest.warnings.push(`yt-dlp returned non-JSON output for ${url}`);
    return null;
  }
  saveRawText('ytdlp', filename, result.stdout);
  manifest.acquisition.ytdlp_used = true;
  return payload;
}

function runYtDlpVideo(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const result = spawnSync('yt-dlp', ['--no-warnings', '--dump-single-json', '--skip-download', url], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 50, windowsHide: true
  });
  if (result.status !== 0) {
    manifest.warnings.push(`yt-dlp metadata failed for ${videoId}: ${(result.stderr || '').trim().slice(0, 300)}`);
    return null;
  }
  let payload;
  try { payload = JSON.parse(result.stdout); } catch { return null; }
  const file = path.join(ytdlpVideosDir, `${videoId}.json`);
  fs.writeFileSync(file, result.stdout, 'utf8');
  manifest.files.ytdlp.push(path.relative(ROOT, file));
  manifest.acquisition.ytdlp_used = true;
  return payload;
}

(async () => {
  const discoveredIds = [];
  const discovered = new Set();
  const addId = (id) => {
    const normalized = extractYouTubeId(id) || (/^[A-Za-z0-9_-]{11}$/.test(String(id || '')) ? String(id) : null);
    if (normalized && !discovered.has(normalized)) { discovered.add(normalized); discoveredIds.push(normalized); }
  };

  let apiUploadsComplete = false;
  let apiPlaylistCount = 0;
  let apiMembershipCount = 0;

  if (apiAvailable) {
    try {
      const channelPayload = await youtubeApi('channels', { part: 'snippet,contentDetails,status', id: channelId, maxResults: 1 }, 'channel.json');
      const channel = channelPayload.items?.[0];
      const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads || null;
      if (!uploadsPlaylistId) throw new Error(`YouTube API returned no uploads playlist for channel ${channelId}`);

      const uploadPages = await paginateApi('playlistItems', {
        part: 'snippet,contentDetails,status', playlistId: uploadsPlaylistId, maxResults: 50
      }, 'uploads-playlist-items');
      for (const p of uploadPages) for (const item of (p.items || [])) addId(item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId);
      apiUploadsComplete = true;

      const batches = [];
      for (let i = 0; i < discoveredIds.length; i += 50) batches.push(discoveredIds.slice(i, i + 50));
      for (let i = 0; i < batches.length; i++) {
        await youtubeApi('videos', {
          part: 'snippet,contentDetails,statistics,status,liveStreamingDetails', id: batches[i].join(','), maxResults: 50
        }, `video-details-${String(i + 1).padStart(3, '0')}.json`);
      }

      const playlistPages = await paginateApi('playlists', {
        part: 'snippet,contentDetails,status', channelId, maxResults: 50
      }, 'playlists');
      const playlists = playlistPages.flatMap((p) => p.items || []);
      apiPlaylistCount = playlists.length;
      for (const pl of playlists) {
        const pid = pl.id;
        if (!pid || pid === uploadsPlaylistId) continue;
        const safePid = String(pid).replace(/[^A-Za-z0-9_-]/g, '_');
        const itemPages = await paginateApi('playlistItems', {
          part: 'snippet,contentDetails,status', playlistId: pid, maxResults: 50
        }, `playlist-${safePid}-items`);
        for (const p of itemPages) {
          for (const item of (p.items || [])) {
            const vid = item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId;
            if (vid) { addId(vid); apiMembershipCount += 1; }
          }
        }
      }
      manifest.acquisition.youtube_api_used = true;
    } catch (err) {
      manifest.warnings.push(`YouTube API acquisition degraded: ${err.message}`);
    }
  }

  let ytdlpVideoTab = null;
  let ytdlpShortsTab = null;
  let ytdlpPlaylistsTab = null;
  if (hasYtDlp) {
    ytdlpVideoTab = runYtDlpJson(`${channelUrl.replace(/\/$/, '')}/videos`, 'channel-videos-flat.json', ['--flat-playlist']);
    for (const e of (ytdlpVideoTab?.entries || [])) addId(e.id || e.url || e.webpage_url);

    ytdlpShortsTab = runYtDlpJson(`${channelUrl.replace(/\/$/, '')}/shorts`, 'channel-shorts-flat.json', ['--flat-playlist']);
    for (const e of (ytdlpShortsTab?.entries || [])) addId(e.id || e.url || e.webpage_url);

    ytdlpPlaylistsTab = runYtDlpJson(`${channelUrl.replace(/\/$/, '')}/playlists`, 'channel-playlists-flat.json', ['--flat-playlist']);

    const parsedLimit = Number(process.env.YOUTUBE_YTDLP_METADATA_LIMIT || '');
    const metadataLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.floor(parsedLimit)
      : (manifest.acquisition.youtube_api_used ? 40 : 200);
    manifest.acquisition.ytdlp_metadata_limit = metadataLimit;

    const canonicalPriority = new Map(canonicalResources.map((r) => [r?.source?.source_id || extractYouTubeId(r?.canonical_url), Number(r?.priority || 0)]));
    const ordered = [...discoveredIds].sort((a, b) => (canonicalPriority.get(b) || 0) - (canonicalPriority.get(a) || 0));
    for (const id of ordered.slice(0, metadataLimit)) runYtDlpVideo(id);
  }

  manifest.completed_at = isoNow();
  manifest.counts = {
    source_videos_discovered: discoveredIds.length,
    api_playlists_discovered: apiPlaylistCount,
    api_playlist_memberships: apiMembershipCount,
    ytdlp_video_tab_entries: ytdlpVideoTab?.entries?.length || 0,
    ytdlp_shorts_tab_entries: ytdlpShortsTab?.entries?.length || 0,
    ytdlp_playlist_tab_entries: ytdlpPlaylistsTab?.entries?.length || 0,
    ytdlp_video_metadata_files: fs.existsSync(ytdlpVideosDir) ? fs.readdirSync(ytdlpVideosDir).filter((f) => f.endsWith('.json')).length : 0
  };
  manifest.discovery_exhaustive = Boolean(apiUploadsComplete || (ytdlpVideoTab && Array.isArray(ytdlpVideoTab.entries)));
  manifest.discovered_video_ids = discoveredIds;
  writeJson(path.join(dirs.raw, 'manifest.json'), manifest);
  console.log(JSON.stringify({ run_id: runId, acquisition: manifest.acquisition, counts: manifest.counts, warnings: manifest.warnings }, null, 2));
})().catch((err) => {
  manifest.failed_at = isoNow();
  manifest.failure = err.message;
  writeJson(path.join(dirs.raw, 'manifest.json'), manifest);
  console.error(err.stack || err.message);
  process.exit(1);
});
