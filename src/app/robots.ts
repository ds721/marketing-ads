import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APPLICATION_URL ?? "http://localhost:3000";
  return {
    rules: [
      // The app itself is private; public tenant sites under /site are indexable.
      { userAgent: "*", allow: ["/", "/site/"], disallow: ["/app/", "/admin/", "/api/", "/onboarding/"] },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
