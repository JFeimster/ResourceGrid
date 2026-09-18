import { NextResponse } from "next/server";
import { getMarketplaceListing } from "../../../../lib/marketplace";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = getMarketplaceListing(slug);
  if (!listing) return NextResponse.json({ error: "plugin_not_found" }, { status: 404 });
  const { instructions, ...publicListing } = listing;
  return NextResponse.json({ ...publicListing, package: { instructionFormat: "SKILL.md", hasInstructions: Boolean(instructions) } });
}
