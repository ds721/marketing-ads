import { NextResponse, type NextRequest } from "next/server";

// Lightweight session check at the edge: presence of the NextAuth session
// cookie gates /app, /admin and /onboarding. Real authorization (roles,
// tenant membership) always happens server-side in src/server/tenant.ts —
// this only saves an unauthenticated render round-trip.
//
// Subdomain tenant sites: {slug}.yourdomain.com rewrites to /site/{slug}.

const PROTECTED = [/^\/app(\/|$)/, /^\/admin(\/|$)/, /^\/onboarding(\/|$)/];

export function middleware(request: NextRequest) {
  const { pathname, host } = { pathname: request.nextUrl.pathname, host: request.headers.get("host") ?? "" };

  // Custom-subdomain public sites (architecture-ready; localhost keeps /site/[slug])
  const appHost = (process.env.APPLICATION_URL ?? "").replace(/^https?:\/\//, "");
  if (appHost && host !== appHost && host.endsWith(`.${appHost}`)) {
    const slug = host.slice(0, -(appHost.length + 1));
    if (slug && slug !== "www") {
      const url = request.nextUrl.clone();
      url.pathname = `/site/${slug}${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  if (PROTECTED.some((re) => re.test(pathname))) {
    const hasSession =
      request.cookies.has("authjs.session-token") ||
      request.cookies.has("__Secure-authjs.session-token");
    if (!hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
