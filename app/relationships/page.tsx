import { masterRegistry } from "../lib/registry";

export default function RelationshipsPage() {
  const master=masterRegistry(); const rels=master.relationships??[];
  return <main><p className="eyebrow">KNOWLEDGE GRAPH</p><h1 className="routeTitle">Relationships</h1>
  <p className="lede">{rels.length.toLocaleString()} resolved canonical relationships.</p>
  <div className="tableWrap"><table><thead><tr><th>Source</th><th>Relationship</th><th>Target</th><th>Context</th></tr></thead>
  <tbody>{rels.slice(0,500).map((r:any)=><tr key={r.relationship_id}><td><code>{r.source_id}</code></td><td>{r.relationship_type}</td><td><code>{r.target?.resource_id ?? `${r.target?.repository ?? ""}:${r.target?.resource_id ?? ""}`}</code></td><td>{r.context??"—"}</td></tr>)}</tbody></table></div></main>;
}