import type { MetadataRoute } from "next";
import { db } from "@/server/db";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APPLICATION_URL ?? "http://localhost:3000";
  const tenants = await db.tenant.findMany({
    where: { status: "ACTIVE", brandSettings: { publicSiteEnabled: true } },
    select: { slug: true, updatedAt: true },
    take: 5000,
  });

  return [
    { url: base, lastModified: new Date(), priority: 1 },
    ...tenants.map((t) => ({
      url: `${base}/site/${t.slug}`,
      lastModified: t.updatedAt,
      priority: 0.8,
    })),
  ];
}
