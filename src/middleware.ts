import { NextResponse, type NextRequest } from "next/server";

// Lightweight session check at the edge: presence of the NextAuth session
// cookie gates /app, /admin and /onboarding. Real authorization (roles,
// tenant membership) always happens server-side in src/server/tenant.ts —
// this only saves an unauthenticated render round-trip.
//
// Everything lives on one domain. A business's public page is markit.app/{slug},
// served by the /[slug] route — no host parsing needed here.

const PROTECTED = [/^\/app(\/|$)/, /^\/admin(\/|$)/, /^\/onboarding(\/|$)/];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
