import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { log } from "@/server/logger";

// ── Meta (Instagram + Facebook) OAuth ─────────────────────────────────────
// One Facebook Login dialog connects both platforms: Instagram publishing runs
// through the Facebook Page linked to the Instagram Business/Creator account.
// We never see a password. We store the long-lived Page token, encrypted.
//
// Prerequisites on the tenant's side, which the UI must explain:
//   1. An Instagram Business or Creator account (not Personal)
//   2. A Facebook Page linked to that Instagram account
//   3. Admin access to that Page

const GRAPH = "https://graph.facebook.com/v21.0";
const DIALOG = "https://www.facebook.com/v21.0/dialog/oauth";
const TIMEOUT_MS = 20_000;
const STATE_TTL_MS = 10 * 60 * 1000;

/** Permissions Meta must approve for the app in App Review. */
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
] as const;

export function isMetaConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function metaRedirectUri(): string {
  const base = (process.env.APPLICATION_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/social/meta/callback`;
}

// ── CSRF state ────────────────────────────────────────────────────────────
// The state round-trips through Meta and back. It's HMAC-signed so a forged
// callback can't attach someone else's Instagram to a tenant of their choosing.

export interface OAuthState {
  tenantSlug: string;
  provider: "instagram" | "facebook";
  nonce: string;
  exp: number;
}

function stateKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to sign OAuth state.");
  return Buffer.from(secret, "utf8");
}

export function signState(input: Omit<OAuthState, "nonce" | "exp">): string {
  const state: OAuthState = {
    ...input,
    nonce: randomBytes(12).toString("base64url"),
    exp: Date.now() + STATE_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const sig = createHmac("sha256", stateKey()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyState(token: string): OAuthState | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", stateKey()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (typeof state.exp !== "number" || state.exp < Date.now()) return null;
    if (state.provider !== "instagram" && state.provider !== "facebook") return null;
    if (!state.tenantSlug) return null;
    return state;
  } catch {
    return null;
  }
}

// ── Dialog URL ────────────────────────────────────────────────────────────

export function authorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    redirect_uri: metaRedirectUri(),
    state,
    scope: META_SCOPES.join(","),
    response_type: "code",
  });
  return `${DIALOG}?${params}`;
}

// ── Token exchange ────────────────────────────────────────────────────────

async function graphGet<T>(path: string, params: Record<string, string>, operation: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(`${GRAPH}${path}?${new URLSearchParams(params)}`, {
      signal: controller.signal,
    });
    const json = (await res.json()) as T & { error?: { message?: string; code?: number } };
    if (!res.ok || json.error) {
      log.error({
        operation,
        provider: "meta",
        status: "error",
        error: `graph_${json.error?.code ?? res.status}`,
        durationMs: Date.now() - started,
      });
      throw new MetaOAuthError(
        "Instagram didn't complete the connection. Try again — if it keeps failing, check that your Instagram is a Business account linked to a Facebook Page.",
      );
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export class MetaOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaOAuthError";
  }
}

/** code → short-lived user token → long-lived user token (~60 days). */
export async function exchangeCodeForLongLivedToken(code: string): Promise<string> {
  const appId = process.env.META_APP_ID ?? "";
  const appSecret = process.env.META_APP_SECRET ?? "";

  const short = await graphGet<{ access_token: string }>(
    "/oauth/access_token",
    { client_id: appId, client_secret: appSecret, redirect_uri: metaRedirectUri(), code },
    "meta.oauth.exchange_code",
  );

  const long = await graphGet<{ access_token: string; expires_in?: number }>(
    "/oauth/access_token",
    {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: short.access_token,
    },
    "meta.oauth.exchange_long_lived",
  );
  return long.access_token;
}

// ── Account discovery ─────────────────────────────────────────────────────

export interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string } | null;
}

export interface DiscoveredAccount {
  provider: "instagram" | "facebook";
  accountId: string;
  accountName: string;
  /** Page access tokens derived from a long-lived user token don't expire. */
  accessToken: string;
  expiresAt: Date | null;
}

export async function discoverPages(userToken: string): Promise<MetaPage[]> {
  const result = await graphGet<{ data?: MetaPage[] }>(
    "/me/accounts",
    {
      access_token: userToken,
      fields: "id,name,access_token,instagram_business_account{id,username}",
      limit: "50",
    },
    "meta.oauth.pages",
  );
  return result.data ?? [];
}

/**
 * Turns Meta's page list into the accounts we can publish to. Pure, so the
 * mapping is testable without a Meta app.
 */
export function accountsFromPages(pages: MetaPage[]): DiscoveredAccount[] {
  const accounts: DiscoveredAccount[] = [];
  for (const page of pages) {
    accounts.push({
      provider: "facebook",
      accountId: page.id,
      accountName: page.name,
      accessToken: page.access_token,
      expiresAt: null,
    });
    if (page.instagram_business_account?.id) {
      accounts.push({
        provider: "instagram",
        accountId: page.instagram_business_account.id,
        accountName: page.instagram_business_account.username
          ? `@${page.instagram_business_account.username}`
          : page.name,
        // Instagram publishes with the linked Page's token.
        accessToken: page.access_token,
        expiresAt: null,
      });
    }
  }
  return accounts;
}
