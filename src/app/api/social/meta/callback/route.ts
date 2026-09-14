import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { requireTenant, TenantAccessError } from "@/server/tenant";
import { encryptSecret } from "@/server/crypto";
import { audit } from "@/server/audit";
import { log } from "@/server/logger";
import {
  verifyState,
  exchangeCodeForLongLivedToken,
  discoverPages,
  accountsFromPages,
  MetaOAuthError,
} from "@/server/social/meta-oauth";

export const dynamic = "force-dynamic";

function back(base: string, slug: string, params: Record<string, string>) {
  const url = new URL(`/app/${slug}/integrations`, base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

/**
 * Meta sends the owner back here. We verify the state twice (signature and
 * cookie), confirm the owner is still an admin of that tenant, then exchange
 * the code and store every Page + Instagram account we're allowed to post to.
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
    // Without a valid state we don't even know which tenant to send them to.
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
    const userToken = await exchangeCodeForLongLivedToken(code);
    const pages = await discoverPages(userToken);
    const accounts = accountsFromPages(pages);

    if (accounts.length === 0) return back(base, slug, { error: "no_pages" });
    const hasInstagram = accounts.some((a) => a.provider === "instagram");
    if (state.provider === "instagram" && !hasInstagram) {
      return back(base, slug, { error: "no_instagram" });
    }

    for (const account of accounts) {
      await db.socialAccount.upsert({
        where: {
          tenantId_provider_accountId: {
            tenantId: ctx.tenant.id,
            provider: account.provider,
            accountId: account.accountId,
          },
        },
        create: {
          tenantId: ctx.tenant.id,
          provider: account.provider,
          accountId: account.accountId,
          accountName: account.accountName,
          accessTokenEnc: encryptSecret(account.accessToken),
          expiresAt: account.expiresAt,
          status: "CONNECTED",
        },
        update: {
          accountName: account.accountName,
          accessTokenEnc: encryptSecret(account.accessToken),
          expiresAt: account.expiresAt,
          status: "CONNECTED",
        },
      });
    }

    await audit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "social.connect",
      meta: {
        providers: [...new Set(accounts.map((a) => a.provider))],
        accounts: accounts.length,
      },
    });

    return back(base, slug, { connected: String(accounts.length) });
  } catch (err) {
    if (err instanceof MetaOAuthError) return back(base, slug, { error: "exchange" });
    log.error({
      operation: "meta.oauth.callback",
      tenantId: ctx.tenant.id,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    return back(base, slug, { error: "exchange" });
  }
}
