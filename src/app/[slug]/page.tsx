import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadSite, siteMetadata } from "@/server/site";
import { TenantSite } from "@/components/tenant-site";
import { isReservedSlug } from "@/lib/reserved-slugs";

// ── A business's public page (§28–29, §43) ────────────────────────────────
// One domain, one path per business: markit.app/glow-salon.
// This is the last route Next tries, so every real page above it still wins;
// the reserved-slug check is a second belt in case a route is added later.

async function load(slug: string) {
  if (isReservedSlug(slug)) return null;
  return loadSite(slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await load(slug);
  if (!tenant) return { title: "Not found" };
  return siteMetadata(tenant);
}

export default async function BusinessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await load(slug);
  if (!tenant) notFound();
  return <TenantSite tenant={tenant} />;
}
