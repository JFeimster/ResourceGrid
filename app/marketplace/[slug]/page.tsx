import Link from "next/link";
import { notFound } from "next/navigation";
import { getMarketplaceListing, marketplaceRegistry } from "../../lib/marketplace";

export default async function MarketplaceListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = getMarketplaceListing(slug);
  if (!found) notFound();
  const listing = found!;
  const targets = marketplaceRegistry().adapterTargets.filter((target) => listing.platforms.includes(target.id));

  return (
    <main className="marketplaceShell">
      <Link href="/marketplace" className="backLink">‚Üê Marketplace</Link>
      <section className="pluginHero">
        <p classNamYOHô^YXúõ›»èû€\›[ôÀù[Y_H»€\›[ôÀö⁄[ôO‹ÇàOû€\›[ôÀõò[Y_O⁄OÇà€\‹”ò[YOHõYHèû€\›[ôÀô\ÿ‹ö\[€üO‹Çà]à€\‹”ò[YOHõX\öŸ]Y‹»èû€\›[ôÀòÿ\Xö[]Y\ÀõX\

\›[ô HOà‹[àŸ^O^€\›[ôﬂOû€\›[ôﬂO‹‹[èä_OŸ]èÇà‹ŸX›[€èÇÇàŸX›[€à€\‹”ò[YOHô]Z[‹öYèÇà\ùX€OÇà‹[èê]òZ[Xö[]O‹‹[èè›õ€ôœû€\›[ôÀò]òZ[Xö[]_O‹›õ€ôœÇàÿ\ùX€OÇà\ùX€OÇà‹[èïô\ú⁄[€è‹‹[èè›õ€ôœû€\›[ôÀùô\ú⁄[€üO‹›õ€ôœÇàÿ\ùX€OÇà\ùX€OÇà‹[èìX]\ö]O‹‹[èè›õ€ôœû€\›[ôÀõX]\ö]Hœ»ê–TPíSUHüO‹›õ€ôœÇàÿ\ùX€OÇà‹ŸX›[€èÇÇà€\›[ôÀò€€\€ô[ùœÀõ[ô›»
àŸX›[€à€\‹”ò[YOHô]Z[ŸX›[€àèè€\‹”ò[YOHô^YXúõ›»èê””T‘—Q‘TêU‘è‹èèí[ò€YYÿ\Xö[]Y\œ⁄èè]à€\‹”ò[YOHõX\öŸ]Y‹»èû€\›[ôÀò€€\€ô[ùÀõX\

][JHOà[ö»Ÿ^O^⁄][_HôYè^ÿ€X\öŸ]XŸK…⁄][_XOû⁄][_O”[öœä_OŸ]èè‹ŸX›[€èÇà
Hàù[BÇàŸX›[€à€\‹”ò[YOHô]Z[ŸX›[€àèÇà€\‹”ò[YOHô^YXúõ›»èë—SëTêUHQTTè‹Çàèï\ŸHHÿ[YHÿ\Xö[]H]ô\û]⁄\ôKè⁄èÇà]à€\‹”ò[YOHòY\\ë‹öYèÇà›\ôŸ]ÀõX\

\ôŸ]
HOà
àHŸ^O^›\ôŸ]öYHôYè^ÿÿ\K›åKÿY\\úÀ…›\ôŸ]öYK…€\›[ôÀú€YﬂXH€\‹”ò[YOHòY\\êÿ\ôèÇà›õ€ôœû›\ôŸ]õXô[O‹›õ€ôœè‹[èû›\ôŸ]õ›]]O‹‹[èèèëŸ[ô\ò]H8°§èÿèÇàÿOÇà
J_BàŸ]èÇà‹ŸX›[€èÇÇàŸX›[€à€\‹”ò[YOHô]Z[ŸX›[€àèè€\‹”ò[YOHô^YXúõ›»èê–Sì”íP–S”’Tê—O‹èôH€\‹”ò[YOHöú€€îô]öY]»èû“î””ãú›ö[ô⁄YûJ\›[ôÀú€›\òŸKù[ä_O‹ôOè‹ŸX›[€èÇà€XZ[èÇà
N¬üB