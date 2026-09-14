import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { requireTenant, TenantAccessError } from "@/server/tenant";
import { encryptSecret } from "@/server/crypto";
import { audit } from "@/server/audit";
import { log } from "@/server/logger";
import {
  verifyState,
  exchangeCode,
  fetchProfile,
  canPublish,
  InstagramOAuthError,
} from "@/server/social/instagram-oauth";

export const dynamic = "force-dynamic";

function back(base: string, slug: string, params: Record<string, string>) {
  const url = new URL(`/app/${slug}/integrations`, base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

/**
 * Instagram sends the owner back here. We verify the state twice (signature
 * and cookie), confirm the owner is still an admin of that tenant, exchange
 * the code, check the account can actually publish, then store it encrypted.
 */
export async function GET(request: Request) {
  const base = process.env.APPLICATION_URL ?? new URL(request.url).origin;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state") ?? "";
  const denied = url.searchParams.get("error");

  const jar = await cookies();
  const cookieState = jar.get("markit_oauth_state")?.value;
  jar.delete("markit_oauth_state");

  const state = verifyState(stateParam);
  if (!state || !cookieState || cookieState !== stateParam) {
    return NextResponse.redirect(new URL("/app?error=oauth_state", base));
  }
  const slug = state.tenantSlug;

  if (denied || !code) return back(base, slug, { error: "denied" });

  let ctx;
  try {
    ctx = await requireTenant(slug, "ADMIN");
  } catch (err) {
    if (err instanceof TenantAccessError) return back(base, slug, { error: "no_access" });
    throw err;
  }

  try {
    const token = await exchangeCode(code);
    const profile = await fetchProfile(token.accessToken);

    // A Personal account can log in but can't publish. Say so now, not at
    // 6 PM on Saturday when the first scheduled post fails.
    if (!canPublish(profile)) return back(base, slug, { error: "personal_account" });

    await db.socialAccount.upsert({
      where: {
        tenantId_provider_accountId: {
          tenantId: ctx.tenant.id,
          provider: "instagram",
          accountId: profile.id,
        },
      },
      create: {
        tenantId: ctx.tenant.id,
        provider: "instagram",
        accountId: profile.id,
        accountName: `@${profile.username}`,
        accessTokenEnc: encryptSecret(token.accessToken),
        expiresAt: token.expiresAt,
        status: "CONNECTED",
      },
      update: {
        accountName: `@${profile.username}`,
        accessTokenEnc: encryptSecret(token.accessToken),
        expiresAt: token.expiresAt,
        status: "CONNECTED",
      },
    });

    await audit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "social.connect",
      meta: { provider: "instagram", username: profile.username },
    });

    return back(base, slug, { connected: "instagram" });
  } catch (err) {
    if (!(err instanceof InstagramOAuthError)) {
      log.error({
        operation: "instagram.oauth.callback",
        tenantId: ctx.tenant.id,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return back(base, slug, { error: "exchange" });
  }
}
