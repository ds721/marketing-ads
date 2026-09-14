// ── Reserved slugs ────────────────────────────────────────────────────────
// Business pages live at the site root (markit.app/glow-salon), so a slug must
// never collide with a platform route — a business called "Login" would
// otherwise shadow the login page for everyone.
//
// Anything that is, or might become, a top-level path belongs in this list.

export const RESERVED_SLUGS = new Set([
  // current routes
  "app", "admin", "api", "login", "logout", "register", "signup", "signin",
  "onboarding", "verify", "reset-password", "forgot-password", "site", "deletion-status",
  // framework + well-known paths
  "_next", "static", "public", "favicon.ico", "robots.txt", "sitemap.xml",
  "manifest.json", ".well-known",
  // reserved for the platform's own future pages
  "about", "blog", "contact", "docs", "help", "support", "pricing", "privacy",
  "terms", "legal", "status", "settings", "account", "billing", "dashboard",
  "home", "index", "new", "search", "explore", "www", "mail", "cdn", "assets",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}
