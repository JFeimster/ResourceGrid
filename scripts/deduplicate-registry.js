const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REGISTRIES = path.join(ROOT, 'registries');
const COMPILED = path.join(ROOT, 'compiled');

function walkJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkJson(full);
    return entry.isFile() && entry.name.endsWith('.json') ? [full] : [];
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function entitiesFrom(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return [];
  if (Array.isArray(doc.resources)) return doc.resources;
  if (Array.isArray(doc.entities)) return doc.entities;
  return [];
}

function norm(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\/$/, '') : null;
}

function titleNorm(value) {
  return typeof value === 'string'
    ? value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
    : null;
}

function add(map, key, row) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(row);
}

fs.mkdirSync(COMPILED, { recursive: true });

const byId = new Map();
const byUrl = new Map();
const byRepo = new Map();
const byTitle = new Map();
let entityCount = 0;

for (const file of walkJson(REGISTRIES)) {
  let doc;
  try { doc = readJson(file); } catch { continue; }
  for (const entity of entitiesFrom(doc)) {
    if (!entity || !entity.resource_id) continue;
    entityCount++;
    const row = {
      resource_id: entity.resource_id,
      entity_type: entity.entity_type || null,
      title: entity.title || null,
      file: path.relative(ROOT, file)
    };
    add(byId, entity.resource_id, row);
    add(byUrl, norm(entity.canonical_url || entity.public_url), row);
    add(byRepo, norm(entity.repo_url), row);
    add(byTitle, titleNorm(entity.title), row);
  }
}

function duplicateGroups(map, { requireDifferentIds = false } = {}) {
  const groups = [];
  for (const [key, rows] of map.entries()) {
    if (rows.length < 2) continue;
    if (requireDifferentIds && new Set(rows.map((r) => r.resource_id)).size < 2) continue;
    groups.push({ key, count: rows.length, records: rows });
  }
  return groups.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

const duplicateIds = duplicateGroups(byId);
const duplicateUrls = duplicateGroups(byUrl, { requireDifferentIds: true });
const duplicateRepos = duplicateGroups(byRepo, { requireDifferentIds: true });
const duplicateTitles = duplicateGroups(byTitle, { requireDifferentIds: true });

const report = {
  generated_at: new Date().toISOString(),
  summary: {
    entities_scanned: entityCount,
    duplicate_id_groups: duplicateIds.length,
    shared_url_groups: duplicateUrls.length,
    shared_repo_groups: duplicateRepos.length,
    shared_title_groups: duplicateTitles.length
  },
  duplicate_ids: duplicateIds,
  shared_urls: duplicateUrls,
  shared_repositories: duplicateRepos,
  shared_titles: duplicateTitles,
  policy: {
    fatal: ['duplicate resource_id'],
    review_only: ['shared canonical/public URL', 'shared repo URL', 'normalized title match']
  }
};

fs.writeFileSync(path.join(COMPILED, 'deduplication-report.json'), JSON.stringify(report, null, 2) + '\n');

console.log(`Entities scanned: ${entityCount}`);
console.log(`Duplicate resource_id groups: ${duplicateIds.length}`);
console.log(`Shared URL groups: ${duplicateUrls.length}`);
console.log(`Shared repo groups: ${duplicateRepos.length}`);
console.log(`Shared title groups: ${duplicateTitles.length}`);

if (duplicateIds.length) {
  console.error('FAILED: duplicate canonical resource_id values found.');
  process.exitCode = 1;
} else {
  console.log('PASS: no duplicate canonical resource_id values.');
}
