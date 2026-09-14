import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireTenant, TenantAccessError } from "@/server/tenant";
import { checkEntitlement, UsageLimitError } from "@/server/usage";
import { audit } from "@/server/audit";
import { isInstagramConfigured, signState, authorizationUrl } from "@/server/social/instagram-oauth";

export const dynamic = "force-dynamic";

function back(base: string, slug: string, error?: string) {
  const url = new URL(`/app/${slug}/integrations`, base);
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

/**
 * Starts the Instagram connection. Everything that could go wrong is decided
 * here, before the owner leaves the app, so they never bounce off Instagram
 * confused.
 */
export async function GET(request: Request) {
  const base = process.env.APPLICATION_URL ?? new URL(request.url).origin;
  const slug = new URL(request.url).searchParams.get("tenant") ?? "";
  if (!slug) return NextResponse.redirect(new URL("/app", base));

  let ctx;
  try {
    ctx = await requireTenant(slug, "ADMIN");
  } catch (err) {
    if (err instanceof TenantAccessError) return back(base, slug, "no_access");
    throw err;
  }

  if (!isInstagramConfigured()) return back(base, slug, "not_configured");

  try {
    await checkEntitlement(ctx.tenant.id, "connected_accounts");
  } catch (err) {
    if (err instanceof UsageLimitError) return back(base, slug, "limit");
    throw err;
  }

  const state = signState({ tenantSlug: slug });

  // The state also lives in a cookie so the callback can confirm the same
  // browser that started the flow is finishing it.
  const jar = await cookies();
  jar.set("markit_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/social",
    maxAge: 600,
  });

  await audit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "social.connect_start",
    meta: { provider: "instagram" },
  });

  return NextResponse.redirect(authorizationUrl(state));
}
