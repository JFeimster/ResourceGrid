import { NextRequest, NextResponse } from "next/server";
import { buildAdapter, getMarketplaceListing, marketplaceRegistry, searchMarketplace, type AdapterPlatform } from "../../lib/marketplace";

const protocolVersion = "2026-07-28";
const platforms = new Set<AdapterPlatform>(["openai", "claude", "codex", "mcp", "api", "vscode", "saas"]);

function result(id: unknown, payload: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result: payload }, { headers: { "MCP-Protocol-Version": protocolVersion, "Cache-Control": "no-store" } });
}
function error(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status: 200, headers: { "MCP-Protocol-Version": protocolVersion } });
}

export function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const registry = marketplaceRegistry();
  return NextResponse.json({ service: "Operator Marketplace MCP", protocolVersion, endpoint: `${origin}/api/mcp`, tools: ["marketplace.search", "marketplace.get", "marketplace.adapter"], listingCount: registry.listings.length });
}

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch { return error(null, -32700, "Parse error"); }
  const id = body?.id ?? null;
  const method = body?.method ?? request.headers.get("mcp-method");
  const origin = new URL(request.url).origin;

  if (method === "tools/list") {
    return result(id, { ttlMs: 300000, cacheScope: "public", tools: [
      { name: "marketplace.search", title: "Search Operator Marketplace", description: "Search user-owned capabilities by text, theme, type, or platform.", inputSchema: { type: "object", properties: { q: { type: "string" }, theme: { type: "string" }, kind: { type: "string" }, platform: { type: "string" } }, additionalProperties: false } },
      { name: "marketplace.get", title: "Get marketplace capability", description: "Fetch one canonical capability by slug.", inputSchema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"], additionalProperties: false } },
      { name: "marketplace.adapter", title: "Generate platform adapter", description: "Render a canonical capability for OpenAI, Claude, Codex, MCP, API, VS Code, or SaaS.", inputSchema: { type: "object", properties: { slug: { type: "string" }, platform: { type: "string", enum: ["openai", "claude", "codex", "mcp", "api", "vscode", "saas"] } }, required: ["slug", "platform"], additionalProperties: false } },
    ] });
  }

  if (method === "tools/call") {
    const name = body?.params?.name ?? request.headers.get("mcp-name");
    const args = body?.params?.arguments ?? {};
    if (name === "marketplace.search") {
      const data = searchMarketplace(args).map(({ instructions, ...item }) => item);
      return result(id, { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { count: data.length, data } });
    }
    if (name === "marketplace.get") {
      const listing = getMarketplaceListing(String(args.slug ?? ""));
      if (!listing) return error(id, -32004, "Plugin not found");
      const { instructions, ...publicListing } = listing;
      return result(id, { content: [{ type: "text", text: JSON.stringify(publicListing) }], structuredContent: publicListing });
    }
    if (name === "marketplace.adapter") {
      const platform = String(args.platform ?? "") as AdapterPlatform;
      const listing = getMarketplaceListing(String(args.slug ?? ""));
      if (!listing) return error(id, -32004, "Plugin not found");
      if (!platforms.has(platform)) return error(id, -32602, "Unsupported platform");
      const adapter = buildAdapter(platform, listing, origin);
      return result(id, { content: [{ type: "text", text: JSON.stringify(adapter) }], structuredContent: adapter });
    }
    return error(id, -32601, "Unknown tool");
  }

  if (method === "resources/list") {
    return result(id, { ttlMs: 300000, cacheScope: "public", resources: marketplaceRegistry().listings.map((listing) => ({ uri: `marketplace://plugins/${listing.slug}`, name: listing.name, description: listing.tagline, mimeType: "application/json" })) });
  }
  if (method === "resources/read") {
    const uri = String(body?.params?.uri ?? "");
    const slug = uri.replace("marketplace://plugins/", "");
    const listing = getMarketplaceListing(slug);
    if (!listing) return error(id, -32004, "Resource not found");
    const { instructions, ...publicListing } = listing;
    return result(id, { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(publicListing) }] });
  }
  if (method === "prompts/list") return result(id, { ttlMs: 300000, cacheScope: "public", prompts: [] });

  return error(id, -32601, `Method not found: ${String(method)}`);
}
