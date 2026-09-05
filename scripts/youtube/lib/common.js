const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../..');
const BATCH = 'youtube-v2-batch-1';

function stripBom(text) {
  return text.replace(/^\uFEFF/, '');
}

function readJson(file) {
  return JSON.parse(stripBom(fs.readFileSync(file, 'utf8')));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function walk(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, predicate);
    return entry.isFile() && predicate(full) ? [full] : [];
  });
}

function walkJson(dir) {
  return walk(dir, (f) => f.endsWith('.json'));
}

function entitiesFrom(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return [];
  if (Array.isArray(doc.resources)) return doc.resources;
  if (Array.isArray(doc.entities)) return doc.entities;
  return [];
}

function relationshipsFrom(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return [];
  return Array.isArray(doc.relationships) ? doc.relationships : [];
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function sha256File(file) {
  if (!fs.existsSync(file)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function getGitHead() {
  try { return git(['rev-parse', 'HEAD']); } catch { return null; }
}

function getGitBranch() {
  try { return git(['branch', '--show-current']); } catch { return null; }
}

function commandExists(cmd, versionArgs = ['--version']) {
  try {
    const res = spawnSync(cmd, versionArgs, { encoding: 'utf8', windowsHide: true });
    return res.status === 0;
  } catch {
    return false;
  }
}

function isoNow() {
  return new Date().toISOString();
}

function dateStamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenize(value) {
  const stop = new Set([
    'a','an','and','are','as','at','be','by','for','from','how','in','into','is','it','of','on','or','the','to','vs','with',
    'your','you','what','why','when','this','that','2024','2025','2026'
  ]);
  return normalizeTitle(value).split(' ').filter((t) => t.length > 2 && !stop.has(t));
}

function jaccard(a, b) {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
}

function extractYouTubeId(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null;
    }
    if (host.endsWith('youtube.com')) {
      const v = u.searchParams.get('v');
      if (/^[A-Za-z0-9_-]{11}$/.test(v || '')) return v;
      const parts = u.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'live'].includes(parts[0])) {
        const id = parts[1];
        return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null;
      }
    }
  } catch {}
  return null;
}

function canonicalWatchUrl(videoId) {
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

function canonicalEmbedUrl(videoId) {
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

function normalizeUrl(value) {
  if (!value) return null;
  try {
    const u = new URL(String(value).trim());
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    const tracking = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','mc_cid','mc_eid'];
    for (const key of tracking) u.searchParams.delete(key);
    // Normalize known YouTube forms to one stable watch URL.
    const yid = extractYouTubeId(u.toString());
    if (yid) return canonicalWatchUrl(yid).replace('www.', '');
    let out = u.toString();
    if (u.pathname !== '/' && out.endsWith('/')) out = out.slice(0, -1);
    return out;
  } catch {
    return null;
  }
}

function extractHttpUrls(text) {
  if (!text) return [];
  const matches = String(text).match(/https?:\/\/[^\s<>()\[\]{}"']+/gi) || [];
  return [...new Set(matches.map((raw) => {
    const cleaned = raw.replace(/[.,;:!?]+$/g, '').replace(/[)\]}]+$/g, '');
    return cleaned;
  }))];
}

function isYouTubeUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return h === 'youtu.be' || h.endsWith('youtube.com');
  } catch { return false; }
}

function loadCanonicalEntities() {
  const registries = path.join(ROOT, 'registries');
  const entities = [];
  for (const file of walkJson(registries)) {
    let doc;
    try { doc = readJson(file); } catch { continue; }
    for (const entity of entitiesFrom(doc)) {
      if (entity && entity.resource_id) entities.push({ ...entity, _registry_file: path.relative(ROOT, file) });
    }
  }
  return entities;
}

function loadRelationships() {
  const root = path.join(ROOT, 'relationships');
  const rels = [];
  for (const file of walkJson(root)) {
    let doc;
    try { doc = readJson(file); } catch { continue; }
    for (const rel of relationshipsFrom(doc)) {
      if (rel && rel.relationship_id) rels.push({ ...rel, _relationship_file: path.relative(ROOT, file) });
    }
  }
  return rels;
}

function buildUrlIndex(entities) {
  const map = new Map();
  const fields = ['canonical_url','public_url','embed_url','repo_url','internal_url'];
  for (const entity of entities) {
    const candidates = [];
    for (const f of fields) if (entity[f]) candidates.push({ field: f, value: entity[f] });
    if (entity.source && entity.source.source_url) candidates.push({ field: 'source.source_url', value: entity.source.source_url });
    for (const c of candidates) {
      const n = normalizeUrl(c.value);
      if (!n) continue;
      if (!map.has(n)) map.set(n, []);
      map.get(n).push({ resource_id: entity.resource_id, entity_type: entity.entity_type || null, title: entity.title || null, field: c.field, registry_file: entity._registry_file });
    }
  }
  return map;
}

function targetFamily(entityType) {
  const content = new Set(['blog_article','youtube_video','short_video','newsletter','social_content','landing_page']);
  const cta = new Set(['affiliate_partner','partner_cta','internal_cta','form','offer','lead_magnet','guide','service']);
  if (content.has(entityType)) return 'content';
  if (cta.has(entityType)) return 'cta';
  return 'resource';
}

function relationshipFileForTarget(entityType) {
  const fam = targetFamily(entityType);
  if (fam === 'content') return 'relationships/content-to-content.json';
  if (fam === 'cta') return 'relationships/content-to-ctas.json';
  return 'relationships/content-to-resources.json';
}

function stableRelationshipId(sourceId, type, targetId, existingIds = new Set()) {
  const base = `rel-${slug(sourceId)}-${slug(type)}-${slug(targetId)}`;
  if (!existingIds.has(base)) return base;
  const suffix = sha256Text(`${sourceId}|${type}|${targetId}`).slice(0, 8);
  const withHash = `${base}-${suffix}`;
  return withHash;
}

function parseIsoDuration(value) {
  if (!value || typeof value !== 'string') return null;
  const m = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!m) return null;
  return Math.round((Number(m[1] || 0) * 86400) + (Number(m[2] || 0) * 3600) + (Number(m[3] || 0) * 60) + Number(m[4] || 0));
}

function ensureRunDirs(runId) {
  const raw = path.join(ROOT, 'inbox', 'raw', 'youtube', runId);
  const normalized = path.join(ROOT, 'inbox', 'normalized', 'youtube', runId);
  const reconciliation = path.join(ROOT, 'reconciliation', BATCH, runId);
  const enrichment = path.join(ROOT, 'enrichment', BATCH, runId);
  for (const d of [raw, normalized, reconciliation, enrichment]) fs.mkdirSync(d, { recursive: true });
  return { raw, normalized, reconciliation, enrichment };
}

function latestPointerFile() {
  return path.join(ROOT, 'reconciliation', BATCH, 'latest-run.json');
}

function getLatestRunId() {
  const file = latestPointerFile();
  if (!fs.existsSync(file)) return null;
  try { return readJson(file).run_id || null; } catch { return null; }
}

function registryCounts() {
  const entities = loadCanonicalEntities();
  const rels = loadRelationships();
  const ids = new Map();
  const duplicateEntityIds = [];
  for (const e of entities) {
    if (ids.has(e.resource_id)) duplicateEntityIds.push(e.resource_id);
    else ids.set(e.resource_id, true);
  }
  const relIds = new Map();
  const duplicateRelationshipIds = [];
  const selfReferences = [];
  for (const r of rels) {
    if (relIds.has(r.relationship_id)) duplicateRelationshipIds.push(r.relationship_id);
    else relIds.set(r.relationship_id, true);
    if (r.target && r.target.resource_id && r.source_id === r.target.resource_id) selfReferences.push(r.relationship_id);
  }
  const countByFile = {};
  for (const r of rels) {
    const relFile = String(r._relationship_file || '').replace(/\\/g, '/');
    countByFile[relFile] = (countByFile[relFile] || 0) + 1;
  }
  return {
    total_entities: entities.length,
    youtube_videos: entities.filter((e) => e.entity_type === 'youtube_video').length,
    short_videos: entities.filter((e) => e.entity_type === 'short_video').length,
    total_relationships: rels.length,
    content_to_content: countByFile['relationships/content-to-content.json'] || 0,
    content_to_resources: countByFile['relationships/content-to-resources.json'] || 0,
    content_to_ctas: countByFile['relationships/content-to-ctas.json'] || 0,
    duplicate_canonical_ids: duplicateEntityIds,
    duplicate_relationship_ids: duplicateRelationshipIds,
    self_references: selfReferences
  };
}

function canonicalStateHashes() {
  const files = [
    'registries/content/youtube-videos.json',
    'registries/content/shorts.json',
    'relationships/content-to-content.json',
    'relationships/content-to-resources.json',
    'relationships/content-to-ctas.json'
  ];
  return Object.fromEntries(files.map((rel) => [rel, sha256File(path.join(ROOT, rel))]));
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i += 1; }
    else out[key] = true;
  }
  return out;
}

function topTerms(text, limit = 20) {
  const counts = new Map();
  for (const t of tokenize(text)) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([term, count]) => ({ term, count }));
}

function parseVttToText(raw) {
  return String(raw || '')
    .replace(/^WEBVTT.*$/gmi, '')
    .replace(/^NOTE.*$/gmi, '')
    .replace(/^\d+$/gm, '')
    .replace(/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s+-->.*$/gm, '')
    .replace(/^\d{2}:\d{2}[.,]\d{3}\s+-->.*$/gm, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  ROOT, BATCH, readJson, writeJson, walk, walkJson, entitiesFrom, relationshipsFrom,
  sha256Text, sha256File, git, getGitHead, getGitBranch, commandExists, isoNow, dateStamp,
  slug, normalizeTitle, tokenize, jaccard, extractYouTubeId, canonicalWatchUrl, canonicalEmbedUrl,
  normalizeUrl, extractHttpUrls, isYouTubeUrl, loadCanonicalEntities, loadRelationships, buildUrlIndex,
  targetFamily, relationshipFileForTarget, stableRelationshipId, parseIsoDuration, ensureRunDirs,
  latestPointerFile, getLatestRunId, registryCounts, canonicalStateHashes, parseArgs, topTerms, parseVttToText
};
