import { NextRequest, NextResponse } from "next/server";
import { marketplaceRegistry, searchMarketplace } from "../../../lib/marketplace";

export function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const results = searchMarketplace({
    q: searchParams.get("q") ?? undefined,
    theme: searchParams.get("theme") ?? undefined,
    kind: searchParams.get("kind") ?? undefined,
    platform: searchParams.get("platform") ?? undefined,
  });
  const registry = marketplaceRegistry();

  return NextResponse.json({
    registryVersion: registry.registryVersion,
    count: results.length,
    data: results,
  });
}
