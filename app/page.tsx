import { masterRegistry } from "./lib/registry";
export default function Home() {
 const m=masterRegistry();
 return <main><section className="hero"><p className="eyebrow">RESOURCE INTELLIGENCE LAYER</p><h1>ResourceGrid</h1>
 <p className="lede">Canonical content, resources, relationships, sources, and machine-ready context for the Distilled Funding ecosystem.</p></section>
 <section className="grid"><article><span>Entities</span><strong>{m.entity_count??0}</strong></article><article><span>Relationships</span><strong>{m.relationship_count??0}</strong></article><article><span>Registry files</span><strong>{m.source_registry_count??0}</strong></article></section>
 </main>;
}