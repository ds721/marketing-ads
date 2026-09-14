import { db } from "@/server/db";
import type { Metadata } from "next";

// Shared loader for the public tenant site, reached either at /site/{slug} or
// at the tenant's own verified domain. One query shape, one place to change.

export async function loadSite(slug: string) {
  const tenant = await db.tenant.findUnique({
    where: { slug },
    include: {
      businessProfile: true,
      brandSettings: true,
      products: { where: { isAvailable: true }, orderBy: { createdAt: "asc" }, take: 24 },
      offers: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 6 },
    },
  });
  if (!tenant || tenant.status !== "ACTIVE") return null;
  if (tenant.brandSettings && !tenant.brandSettings.publicSiteEnabled) return null;
  return tenant;
}

export type SiteData = NonNullable<Awaited<ReturnType<typeof loadSite>>>;

export function siteMetadata(tenant: SiteData): Metadata {
  const p = tenant.businessProfile;
  const b = tenant.brandSettings;
  const title = b?.seoTitle ?? `${tenant.name}${p?.city ? ` · ${p.city}` : ""}`;
  const description =
    b?.seoDescription ??
    b?.brandDescription ??
    p?.aboutRaw?.slice(0, 155) ??
    `${tenant.name} — ${p?.category ?? "local business"}${p?.city ? ` in ${p.city}` : ""}.`;

  // One domain, one address per business: markit.app/{slug}.
  const base = process.env.APPLICATION_URL ?? "http://localhost:3000";
  const canonical = `${base}/${tenant.slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: "website", url: canonical },
    robots: { index: b?.publicSiteEnabled ?? true, follow: true },
  };
}
