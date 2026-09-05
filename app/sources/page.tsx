import { sourceDefinitions } from "../lib/registry";

export default function SourcesPage() {
  const sources=sourceDefinitions();
  return <main><p className="eyebrow">PROVENANCE</p><h1 className="routeTitle">Sources</h1>
  <p className="lede">{sources.length} configured source systems feeding ResourceGrid.</p>
  <section className="cards">{sources.map((s:any)=><article key={s.file}><span>{s.source_type??"source"}</span><h2>{s.name??s.file}</h2><p>{s.purpose??"No description."}</p><small>{s.file} · {s.status??"unknown"}</small></article>)}</section></main>;
}