import fs from "node:fs";
import path from "node:path";

export type MarketplaceKind = "skill" | "tool" | "operator";
export type AdapterPlatform = "openai" | "claude" | "codex" | "mcp" | "api" | "vscode" | "saas";

export type MarketplaceListing = {
  id: string;
  slug: string;
  name: string;
  kind: MarketplaceKind;
  theme: string;
  status: string;
  availability: string;
  tagline: string;
  description: string;
  version: string;
  publisher: string;
  maturity?: string | null;
  monetizationReadiness?: number | null;
  capabilities: string[];
  platforms: AdapterPlatform[];
  components?: string[];
  source: Record<string, unknown>;
  instructions?: string;
};

export type MarketplaceRegistry = {
  registryVersion: string;
  name: string;
  generatedAt: string;
  sourceInventory: Record<string, unknown>;
  adapterTargets: Array<{ id: AdapterPlatform; label: string; output: string }>;
  themes: string[];
  listings: MarketplaceListing[];
};

type MarketplaceIndex = Omit<MarketplaceRegistry, "themes" | "listings"> & {
  themes: Array<{ name: string; file: string; count: number }>;
};

const marketplaceRoot = path.join(process.cwd(), "registries", "marketplace");
const indexPath = path.join(marketplaceRoot, "marketplace.index.json");

export function marketplaceRegistry(): MarketplaceRegistry {
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as MarketplaceIndex;
  const listings = index.themes.flatMap((theme) =>
    JSON.parse(fs.readFileSync(path.join(marketplaceRoot, theme.file), "utf8")) as MarketplaceListing[]
  );
  return {
    registryVersion: index.registryVersion,
    name: index.name,
    generatedAt: index.generatedAt,
    sourceInventory: index.sourceInventory,
    adapterTargets: index.adapterTargets,
    themes: index.themes.map((theme) => theme.name),
    listings,
  };
}

export function marketplaceListings(): MarketplaceListing[] {
  return marketplaceRegistry().listings;
}

export function getMarketplaceListing(slug: string): MarketplaceListing | null {
  return marketplaceListings().find((listing) => listing.slug === slug) ?? null;
}

export function searchMarketplace(params: { q?: string; theme?: string; kind?: string; platform?: string } = {}) {
  const q = (params.q ?? "").trim().toLowerCase();
  const theme = (params.theme ?? "").trim().toLowerCase();
  const kind = (params.kind ?? "").trim().toLowerCase();
  const platform = (params.platform ?? "").trim().toLowerCase();

  return marketplaceListings().filter((listing) => {
    const haystack = [
      listing.name,
      listing.tagline,
      listing.description,
      listing.theme,
      listing.kind,
      ...listing.capabilities,
    ].join(" ").toLowerCase();

    return (!q || haystack.includes(q)) &&
      (!theme || listing.theme.toLowerCase() === theme) &&
      (!kind || listing.kind.toLowerCase() === kind) &&
      (!platform || listing.platforms.some((item) => item.toLowerCase() === platform));
  });
}

function skillMarkdown(listing: MarketplaceListing): string {
  return listing.instructions?.trim() || `# ${listing.name}\n\n${listing.description}`;
}

export function buildAdapter(platform: AdapterPlatform, listing: MarketplaceListing, baseUrl = "") {
  const endpoint = `${baseUrl}/api/v1/plugins/${listing.slug}`;
  const mcpEndpoint = `${baseUrl}/api/mcp`;
  const skill = skillMarkdown(listing);

  const common = {
    marketplace: "Operator Marketplace",
    registryVersion: marketplaceRegistry().registryVersion,
    plugin: {
      id: listing.id,
      slug: listing.slug,
      name: listing.name,
      version: listing.version,
      kind: listing.kind,
      theme: listing.theme,
      description: listing.description,
      components: listing.components ?? [],
    },
  };

  switch (platform) {
    case "openai":
      return {
        ...common,
        adapter: "openai-skill",
        format: "skill-directory",
        files: [
          { path: "SKILL.md", content: skill },
          { path: "operator-marketplace.json", content: JSON.stringify({ source: endpoint, mcp: mcpEndpoint }, null, 2) },
        ],
        api: {
          createSkill: "POST https://api.openai.com/v1/skills",
          createVersion: "POST https://api.openai.com/v1/skills/{skill_id}/versions",
          sourceEndpoint: endpoint,
        },
      };
    case "claude":
      return {
        ...common,
        adapter: "claude-agent-skill",
        format: "skill-directory",
        files: [
          { path: "SKILL.md", content: skill },
          { path: "marketplace.json", content: JSON.stringify({ source: endpoint, mcp: mcpEndpoint }, null, 2) },
        ],
        mcp: { url: mcpEndpoint },
      };
    case "codex":
      return {
        ...common,
        adapter: "codex-plugin",
        format: "plugin-directory",
        files: [
          {
            path: ".codex-plugin/plugin.json",
            content: JSON.stringify({
              name: listing.slug,
              version: listing.version,
              description: listing.tagline,
              skills: ["skills/operator-marketplace/SKILL.md"],
            }, null, 2),
          },
          { path: "skills/operator-marketplace/SKILL.md", content: skill },
        ],
        mcp: { url: mcpEndpoint },
      };
    case "mcp":
      return {
        ...common,
        adapter: "mcp-remote",
        protocolVersion: "2026-07-28",
        transport: "streamable-http-jsonrpc",
        endpoint: mcpEndpoint,
        toolHints: ["marketplace.search", "marketplace.get", "marketplace.adapter"],
      };
    case "api":
      return {
        ...common,
        adapter: "rest-api",
        endpoints: {
          list: `${baseUrl}/api/v1/plugins`,
          get: endpoint,
          adapter: `${baseUrl}/api/v1/adapters/{platform}/${listing.slug}`,
          openapi: `${baseUrl}/api/v1/openapi`,
        },
      };
    case "vscode":
      return {
        ...common,
        adapter: "vscode-workflow",
        recommendedTransport: "mcp",
        mcp: { url: mcpEndpoint },
        files: [
          {
            path: ".vscode/operator-marketplace.json",
            content: JSON.stringify({ plugin: listing.slug, registry: endpoint, mcp: mcpEndpoint }, null, 2),
          },
        ],
      };
    case "saas":
      return {
        ...common,
        adapter: "saas-capability",
        integration: {
          registry: endpoint,
          rest: `${baseUrl}/api/v1/plugins`,
          mcp: mcpEndpoint,
          openapi: `${baseUrl}/api/v1/openapi`,
        },
      };
  }
}
