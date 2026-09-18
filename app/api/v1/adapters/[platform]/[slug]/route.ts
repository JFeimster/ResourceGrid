import { NextRequest, NextResponse } from "next/server";
import { buildAdapter, getMarketplaceListing, type AdapterPlatform } from "../../../../../lib/marketplace";

const platforms = new Set<AdapterPlatform>(["openai", "claude", "codex", "mcp", "api", "vscode", "saas"]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string; slug: string }> }) {
  const { platform, slug } = await params;
  if (!platforms.has(platform as AdapterPlatform)) return NextResponse.json({ error: "unsupported_platform" }, { status: 400 });
  const listing = getMarketplaceListing(slug);
  if (!listing) return NextResponse.json({ error: "plugin_not_found" }, { status: 404 });
  if (!listing.platforms.includes(platform as AdapterPlatform)) return NextResponse.json({ error: "adapter_not_available" }, { status: 409 });
  const baseUrl = new URL(request.url).origin;
  const payload = buildAdapter(platform as AdapterPlatform, listing, baseUrl);
  const requestedFile = request.nextUrl.searchParams.get("file");
  if (requestedFile && "files" in payload && Array.isArray(payload.files)) {
    const file = payload.files.find((entry: { path?: string }) => entry.path === requestedFile);
    if (!file) return NextResponse.json({ error: "adapter_file_not_found" }, { status: 404 });
    const contentType = requestedFile.endsWith(".json") ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8";
    return new NextResponse(file.content, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${requestedFile.split("/").pop()}"`,
        "Cache-Control": "public, max-age=300, s-maxage=300"
      }
    });
  }
  return NextResponse.json(payload, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
}
