const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REGISTRIES = path.join(ROOT, 'registries');
const RELATIONSHIPS = path.join(ROOT, 'relationships');
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

function relationshipsFrom(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return [];
  return Array.isArray(doc.relationships) ? doc.relationships : [];
}

fs.mkdirSync(COMPILED, { recursive: true });

const entities = new Map();
for (const file of walkJson(REGISTRIES)) {
  let doc;
  try { doc = readJson(file); } catch { continue; }
  for (const entity of entitiesFrom(doc)) {
    if (!entity || !entity.resource_id) continue;
    entities.set(entity.resource_id, {
      resource_id: entity.resource_id,
      entity_type: entity.entity_type || null,
      title: entity.title || null,
      file: path.relative(ROOT, file)
    });
  }
}

const resolved = [];
const unresolved = [];
const selfReferences = [];
const seenRelationshipIds = new Map();
const duplicateRelationshipIds = [];

for (const file of walkJson(RELATIONSHIPS)) {
  let doc;
  try { doc = readJson(file); } catch { continue; }
  for (const rel of relationshipsFrom(doc)) {
    const location = path.relative(ROOT, file);
    if (!rel || !rel.relationship_id) continue;

    if (seenRelationshipIds.has(rel.relationship_id)) {
      duplicateRelationshipIds.push({
        relationship_id: rel.relationship_id,
        first_file: seenRelationshipIds.get(rel.relationship_id),
        duplicate_file: location
      });
    } else {
      seenRelationshipIds.set(rel.relationship_id, location);
    }

    const source = entities.get(rel.source_id);
    const targetId = rel.target && rel.target.resource_id;
    const externalRepo = rel.target && rel.target.repository;
    const target = targetId ? entities.get(targetId) : null;

    if (rel.source_id && targetId && rel.source_id === targetId) {
      selfReferences.push({ relationship_id: rel.relationship_id, resource_id: rel.source_id, file: location });
    }

    const sourceOk = Boolean(source);
    const targetOk = Boolean(target || externalRepo);

    if (sourceOk && targetOk) {
      resolved.push({
        relationship_id: rel.relationship_id,
        source_id: rel.source_id,
        relationship_type: rel.relationship_type,
        target: rel.target,
        source_title: source.title,
        target_title: target ? target.title : null,
        file: location
      });
    } else {
      unresolved.push({
        relationship_id: rel.relationship_id,
        source_id: rel.source_id || null,
        target: rel.target || null,
        missing_source: !sourceOk,
        missing_target: !targetOk,
        file: location
      });
    }
  }
}

const report = {
  generated_at: new Date().toISOString(),
  valid: unresolved.length === 0 && duplicateRelationshipIds.length === 0 && selfReferences.length === 0,
  summary: {
    canonical_entities: entities.size,
    relationships_scanned: resolved.length + unresolved.length,
    resolved_relationships: resolved.length,
    unresolved_relationships: unresolved.length,
    duplicate_relationship_ids: duplicateRelationshipIds.length,
    self_references: selfReferences.length
  },
  unresolved,
  duplicate_relationship_ids: duplicateRelationshipIds,
  self_references: selfReferences
};

fs.writeFileSync(path.join(COMPILED, 'relationship-resolution-report.json'), JSON.stringify(report, null, 2) + '\n');

console.log(`Canonical entities: ${entities.size}`);
console.log(`Relationships scanned: ${report.summary.relationships_scanned}`);
console.log(`Resolved: ${resolved.length}`);
console.log(`Unresolved: ${unresolved.length}`);
console.log(`Duplicate relationship IDs: ${duplicateRelationshipIds.length}`);
console.log(`Self references: ${selfReferences.length}`);
console.log(report.valid ? 'PASS: all canonical relationships resolve.' : 'FAILED: relationship integrity issues found.');

process.exitCode = report.valid ? 0 : 1;
