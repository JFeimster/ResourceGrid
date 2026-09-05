import fs from "node:fs";
import path from "node:path";

function summary() {
  try {
    const file = path.join(process.cwd(), "compiled", "master-registry.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data.summary ?? {};
  } catch {
    return {};
  }
}

export default function Home() {
  const s = summary();
  return (
    <main>
      <p className="eyebrow">RESOURCE INTELLIGENCE LAYER</p>
      <h1>ResourceGrid</h1>
      <p className="lede">Canonical content, resources, relationships, sources, and machine-ready context for the Distilled Funding ecosystem.</p>
      <section className="grid">
        <article><span>Entities</span><strong>{s.entity_count ?? "â€”"}</strong></article>
        <article><span>Relationships</span><strong>{s.relationship_count ?? "â€”"}</strong></article>
        <article><span>Registry files</span><strong>{s.registry_files ?? "â€”"}</strong></article>
      </section>
    </main>
  );
}
