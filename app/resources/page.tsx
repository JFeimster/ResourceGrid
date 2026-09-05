import { masterRegistry } from "../lib/registry";

export default function ResourcesPage() {
  const master = masterRegistry();
  const entities = [...(master.entities ?? [])].sort((a,b) =>
    (a.entity_type ?? "").localeCompare(b.entity_type ?? "") || (a.title ?? "").localeCompare(b.title ?? "")
  );
  const counts = entities.reduce((m:any,e:any) => { const k=e.entity_type ?? "unknown"; m[k]=(m[k]??0)+1; return m; }, {});
  return <main>
    <p className="eyebrow">CANONICAL INVENTORY</p><h1 className="routeTitle">Resources</h1>
    <p className="lede">{entities.length.toLocaleString()} canonical entities across {Object.keys(counts).length} entity types.</p>
    <div className="chips">{Object.entries(counts).sort((a:any,b:any)=>b[1]-a[1]).map(([k,v]:any)=><span key={k}>{k} <b>{v}</b></span>)}</div>
    <div className="tableWrap"><table><thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Canonical source</th></tr></thead>
    <tbody>{entities.slice(0,500).map((e:any)=><tr key={e.resource_id}><td><strong>{e.title}</strong><small>{e.resource_id}</small></td><td>{e.entity_type}</td><td>{e.status}</td><td>{e.public_url||e.canonical_url||e.repo_url ? <a href={e.public_url||e.canonical_url||e.repo_url}>Open</a> : "—"}</td></tr>)}</tbody></table></div>
    {entities.length>500 && <p className="notice">Showing the first 500 records. The compiled registry contains {entities.length.toLocaleString()}.</p>}
  </main>;
}