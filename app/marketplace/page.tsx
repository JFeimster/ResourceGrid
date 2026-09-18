import Link from "next/link";
import { marketplaceRegistry, searchMarketplace } from "../lib/marketplace";

export const dynamic = "force-dynamic";

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; theme?: string; kind?: string; platform?: string }>;
}) {
  const params = await searchParams;
  const registry = marketplaceRegistry();
  const results = searchMarketplace(params);

  return (
    <main className="marketplaceShell">
      <section className="marketplaceHero">
        <p className="eyebrow">ONE REGISTRY → MANY RUNTIMES</p>
        <h1>Operator Marketplace</h1>
        <p className="lede">Installable skills, tools, and operator packs generated from one canonical capability registry for OpenAI, Claude, Codex, MCP, APIs, VS Code, and SaaS products.</p>
        <div className="marketStats">
          <span><strong>{registry.listings.length}</strong> publishable capabilities</span>
          <span><strong>{registry.themes.length}</strong> operator themes</span>
          <span><strong>{registry.adapterTargets.length}</strong> adapter targets</span>
        </div>
      </section>

      <form className="marketFilters" action="/marketplace" method="get">
        <input name="q" defaultValue={params.q ?? ""} placeholder="Search capabilities, jobs, or outcomes…" aria-label="Search marketplace" />
        <select name="theme" defaultValue={params.theme ?? ""} aria-label="Theme">
          <option value="">All themes</option>
          {registry.themes.map((theme) => <option key={theme} value={theme}>{theme}</option>)}
        </select>
        <select name="kind" defaultValue={params.kind ?? ""} aria-label="Kind">
          <option value="">All types</option>
          <option value="operator">Operators</option>
          <option value="skill">Skills</option>
          <option value="tool">Tools</option>
        </select>
        <select name="platform" defaultValue={params.platform ?? ""} aria-label="Platform">
          <option value="">All platforms</option>
          {registry.adapterTargets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
        </select>
        <button type="submit">Search</button>
      </form>

      <div className="marketMeta"><span>{results.length} results</span><Link href="/api/v1/plugins">JSON API</Link><Link href="/api/v1/openapi">OpenAPI</Link><Link href="/api/mcp">MCP</Link></div>

      <section className="marketGrid">
        {results.map((listing) => (
          <Link href={`/marketplace/${listing.slug}`} key={listing.id} className="marketCard">
            <div className="marketCardTop"><span>{listing.theme}</span><b>{listing.kind}</b></div>
            <h2>{listing.name}</h2>
            <p>{listing.tagline}</p>
            <div className="marketTags">{listing.platforms.slice(0, 5).map((p) => <span key={p}>{p}</span>)}</div>
            <div className="marketCardFoot"><span>{listing.availability}</span><span>v{listing.version} →</span></div>
          </Link>
        ))}
      </section>
    </main>
  );
}
