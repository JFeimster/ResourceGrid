const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const ROOT = path.resolve(__dirname, '..');
const REGISTRIES = path.join(ROOT, 'registries');
const RELATIONSHIPS = path.join(ROOT, 'relationships');
const SCHEMAS = path.join(ROOT, 'schemas');
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

const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
addFormats(ajv);
const entitySchema = readJson(path.join(SCHEMAS, 'entity.schema.json'));
const relationshipSchema = readJson(path.join(SCHEMAS, 'relationship.schema.json'));
const validateEntity = ajv.compile(entitySchema);
const validateRelationship = ajv.compile(relationshipSchema);

const report = {
  generated_at: new Date().toISOString(),
  valid: true,
  summary: {
    registry_files: 0,
    relationship_files: 0,
    entities_checked: 0,
    relationships_checked: 0,
    json_parse_errors: 0,
    schema_errors: 0
  },
  errors: [],
  warnings: []
};

const entityIds = new Set();

for (const file of walkJson(REGISTRIES)) {
  report.summary.registry_files++;
  let doc;
  try {
    doc = readJson(file);
  } catch (error) {
    report.summary.json_parse_errors++;
    report.errors.push({ file: path.relative(ROOT, file), type: 'json_parse_error', message: error.message });
    continue;
  }

  for (const entity of entitiesFrom(doc)) {
    if (!entity || typeof entity !== 'object') continue;
    if (!entity.resource_id) {
      report.warnings.push({ file: path.relative(ROOT, file), type: 'non_entity_record', title: entity.title || null });
      continue;
    }
    report.summary.entities_checked++;
    entityIds.add(entity.resource_id);
    if (!validateEntity(entity)) {
      report.summary.schema_errors++;
      report.errors.push({
        file: path.relative(ROOT, file),
        resource_id: entity.resource_id,
        type: 'entity_schema_error',
        errors: validateEntity.errors
      });
    }
  }
}

for (const file of walkJson(RELATIONSHIPS)) {
  report.summary.relationship_files++;
  let doc;
  try {
    doc = readJson(file);
  } catch (error) {
    report.summary.json_parse_errors++;
    report.errors.push({ file: path.relative(ROOT, file), type: 'json_parse_error', message: error.message });
    continue;
  }

  for (const rel of relationshipsFrom(doc)) {
    report.summary.relationships_checked++;
    if (!validateRelationship(rel)) {
      report.summary.schema_errors++;
      report.errors.push({
        file: path.relative(ROOT, file),
        relationship_id: rel.relationship_id || null,
        type: 'relationship_schema_error',
        errors: validateRelationship.errors
      });
    }
  }
}

report.valid = report.errors.length === 0;
fs.writeFileSync(path.join(COMPILED, 'validation-report.json'), JSON.stringify(report, null, 2) + '\n');

console.log(`Registry files: ${report.summary.registry_files}`);
console.log(`Entities checked: ${report.summary.entities_checked}`);
console.log(`Relationships checked: ${report.summary.relationships_checked}`);
console.log(`Errors: ${report.errors.length}`);
console.log(`Warnings: ${report.warnings.length}`);
console.log(report.valid ? 'VALID: ResourceGrid passed validation.' : 'INVALID: ResourceGrid validation failed.');

process.exitCode = report.valid ? 0 : 1;
