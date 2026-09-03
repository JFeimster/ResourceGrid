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

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function text(entity) {
  return [
    entity.title,
    entity.description,
    entity.entity_type,
    entity.resource_type,
    ...(entity.topics || []),
    ...(entity.content_clusters || []),
    ...(entity.keywords || []),
    ...(entity.audiences || []),
    ...(entity.industries || []),
    entity.primary_use_case,
    entity.conversion_goal,
    entity.recommended_cta_or_embed_role
  ].filter(Boolean).join(' ').toLowerCase();
}

function compact(entity) {
  return {
    resource_id: entity.resource_id,
    entity_type: entity.entity_type || null,
    title: entity.title || null,
    description: entity.description || null,
    status: entity.status || null,
    topics: entity.topics || [],
    content_clusters: entity.content_clusters || [],
    audiences: entity.audiences || [],
    industries: entity.industries || [],
    funnel_stage: entity.funnel_stage || null,
    primary_use_case: entity.primary_use_case || null,
    conversion_goal: entity.conversion_goal || null,
    priority: entity.priority ?? null,
    canonical_url: entity.canonical_url || null,
    public_url: entity.public_url || null,
    repo_url: entity.repo_url || null,
    recommended_cta_or_embed_role: entity.recommended_cta_or_embed_role || null
  };
}

function write(name, data) {
  fs.writeFileSync(path.join(COMPILED, name), JSON.stringify(data, null, 2) + '\n');
}

fs.mkdirSync(COMPILED, { recursive: true });

const entities = [];
const registrySources = [];
for (const file of walkJson(REGISTRIES)) {
  let doc;
  try { doc = readJson(file); } catch { continue; }
  const records = entitiesFrom(doc).filter((item) => item && item.resource_id);
  if (!records.length) continue;
  registrySources.push({
    file: path.relative(ROOT, file),
    registry_name: doc.registry_name || null,
    registry_version: doc.registry_version || null,
    entity_count: records.length
  });
  for (const entity of records) {
    entities.push({ ...entity, _registry_file: path.relative(ROOT, file) });
  }
}

const byId = new Map();
for (const entity of entities) {
  if (byId.has(entity.resource_id)) {
    throw new Error(`Duplicate resource_id during compilation: ${entity.resource_id}`);
  }
  byId.set(entity.resource_id, entity);
}

const relationships = [];
for (const file of walkJson(RELATIONSHIPS)) {
  let doc;
  try { doc = readJson(file); } catch { continue; }
  for (const rel of relationshipsFrom(doc)) relationships.push({ ...rel, _relationship_file: path.relative(ROOT, file) });
}

const relationIndex = {};
for (const rel of relationships) {
  if (!relationIndex[rel.source_id]) relationIndex[rel.source_id] = [];
  relationIndex[rel.source_id].push({
    relationship_id: rel.relationship_id,
    relationship_type: rel.relationship_type,
    target: rel.target,
    context: rel.context || null,
    weight: rel.weight ?? null
  });
}

const master = {
  registry_name: 'ResourceGrid Compiled Master Registry',
  registry_version: '1.0.0',
  generated_at: new Date().toISOString(),
  generated_from: 'canonical modular registries',
  source_registry_count: registrySources.length,
  entity_count: entities.length,
  relationship_count: relationships.length,
  source_registries: registrySources,
  entities: entities.map((entity) => ({
    ...entity,
    relationships: relationIndex[entity.resource_id] || []
  })),
  relationships
};
write('master-registry.json', master);

const recommendationIndex = {
  generated_at: master.generated_at,
  count: entities.length,
  resources: entities
    .map((e) => ({
      ...compact(e),
      best_for_content: e.best_for_content || [],
      capabilities: e.capabilities || [],
      relationship_count: (relationIndex[e.resource_id] || []).length
    }))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0) || (a.title || '').localeCompare(b.title || ''))
};
write('resource-recommendation-index.json', recommendationIndex);

const ctaTypes = new Set(['affiliate_partner', 'partner_cta', 'internal_cta', 'form', 'offer', 'lead_magnet', 'service']);
const ctas = entities.filter((e) => ctaTypes.has(e.entity_type) || /cta|apply|offer|lead magnet|referral/.test(text(e)));
write('cta-library.json', {
  generated_at: master.generated_at,
  count: ctas.length,
  resources: ctas.map(compact)
});

const linkTypes = new Set(['blog_article', 'youtube_video', 'short_video', 'landing_page', 'site', 'microsite', 'directory', 'community']);
const linkable = entities.filter((e) => linkTypes.has(e.entity_type) && (e.public_url || e.canonical_url));
write('internal-link-index.json', {
  generated_at: master.generated_at,
  count: linkable.length,
  resources: linkable.map(compact)
});

const packs = {
  'acquisition-content-pack.json': ['acquisition', 'eta', 'seller note', 'valuation', 'business buyer', 'm&a', 'mergers'],
  'funding-content-pack.json': ['funding', 'lender', 'loan', 'capital', 'credit', 'underwriting', 'financing'],
  'broker-content-pack.json': ['broker', 'affiliate', 'funding agency', 'partner', 'referral'],
  'ecommerce-content-pack.json': ['ecommerce', 'amazon', 'shopify', 'inventory', 'saas', 'mrr', 'subscription'],
  'seo-content-pack.json': ['seo', 'aeo', 'content', 'keyword', 'blog', 'youtube', 'search']
};

for (const [fileName, terms] of Object.entries(packs)) {
  const matches = entities.filter((entity) => {
    const haystack = text(entity);
    return terms.some((term) => haystack.includes(term));
  });
  write(fileName, {
    generated_at: master.generated_at,
    terms,
    count: matches.length,
    resources: matches.map(compact)
  });
}

const blogContext = entities.filter((e) => {
  const haystack = text(e);
  return ['blog', 'seo', 'content', 'article', 'cta', 'calculator', 'custom_gpt', 'tool'].some((term) => haystack.includes(term));
});
write('blog-generator-context.json', {
  generated_at: master.generated_at,
  instructions: {
    prefer_primary_resource: true,
    prefer_existing_internal_links: true,
    avoid_duplicate_ctas: true,
    use_affiliate_disclosure_when_required: true
  },
  resource_count: blogContext.length,
  resources: blogContext.map(compact)
});

write('relationship-index.json', {
  generated_at: master.generated_at,
  source_count: Object.keys(relationIndex).length,
  relationship_count: relationships.length,
  relationships_by_source: relationIndex
});

console.log(`Compiled ${entities.length} canonical entities from ${registrySources.length} registries.`);
console.log(`Compiled ${relationships.length} relationships.`);
console.log('Generated master registry, recommendation index, CTA/internal-link indexes, relationship index, blog context, and 5 vertical content packs.');
