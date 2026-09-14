import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APPLICATION_URL ?? "http://localhost:3000";
  return {
    rules: [
      // The app itself is private; every business page (markit.app/{slug}) is
      // public and indexable, so allow the root and block only the app paths.
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app/", "/admin/", "/api/", "/onboarding/", "/login", "/register"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
