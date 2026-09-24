import type { MetadataRoute } from "next";
import { db } from "@/server/db";

// Listing every public business page. Generated per request rather than at
// build time: the list changes whenever a business signs up, and a database
// that is briefly unreachable must not fail a deploy.
export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APPLICATION_URL ?? "http://localhost:3000";
  const home = { url: base, lastModified: new Date(), priority: 1 };

  try {
    const tenants = await db.tenant.findMany({
      where: { status: "ACTIVE", brandSettings: { publicSiteEnabled: true } },
      select: { slug: true, updatedAt: true },
      take: 5000,
    });
    return [
      home,
      ...tenants.map((t) => ({
        url: `${base}/${t.slug}`,
        lastModified: t.updatedAt,
        priority: 0.8,
      })),
    ];
  } catch {
    // No database yet (first deploy) or a blip: still serve a valid sitemap.
    return [home];
  }
}
