import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    openapi: "3.1.0",
    info: { title: "Operator Marketplace API", version: "1.0.0", description: "One capability registry for skills, tools, operators, adapters, MCP clients, and SaaS integrations." },
    servers: [{ url: origin }],
    paths: {
      "/api/v1/plugins": { get: { summary: "Search marketplace capabilities", parameters: ["q", "theme", "kind", "platform"].map((name) => ({ name, in: "query", required: false, schema: { type: "string" } })), responses: { "200": { description: "Marketplace results" } } } },
      "/api/v1/plugins/{slug}": { get: { summary: "Get one marketplace capability", parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Capability" }, "404": { description: "Not found" } } } },
      "/api/v1/adapters/{platform}/{slug}": { get: { summary: "Generate a platform adapter from the canonical capability", parameters: [{ name: "platform", in: "path", required: true, schema: { type: "string", enum: ["openai", "claude", "codex", "mcp", "api", "vscode", "saas"] } }, { name: "slug", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Generated adapter package" } } } },
      "/api/mcp": { post: { summary: "Remote MCP JSON-RPC endpoint", responses: { "200": { description: "MCP response" } } } },
    },
  });
}
