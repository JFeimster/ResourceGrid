import { deduplicationReport } from "../lib/registry";

export default function DuplicatesPage() {
 const report=deduplicationReport();
 const s=report.summary??{};
 const groups=[
  ["Duplicate resource IDs",report.duplicate_resource_ids??report.duplicate_resource_id_groups??[]],
  ["Shared URLs",report.shared_urls??report.shared_url_groups??[]],
  ["Shared repositories",report.shared_repos??report.shared_repo_groups??[]],
  ["Shared titles",report.shared_titles??report.shared_title_groups??[]]
 ];
 return <main><p className="eyebrow">DATA HYGIENE</p><h1 className="routeTitle">Duplicates</h1>
 <p className="lede">Canonical-ID collisions are blockers. Shared titles, URLs, and repositories are review signals.</p>
 <section className="grid">{groups.map(([label,data]:any)=><article key={label}><span>{label}</span><strong>{Array.isArray(data)?data.length:"—"}</strong></article>)}</section>
 <pre className="jsonPreview">{JSON.stringify(s,null,2)}</pre></main>;
}
