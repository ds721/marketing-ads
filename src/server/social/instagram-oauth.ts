import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { log } from "@/server/logger";

// ── Instagram Login (direct, no Facebook Page) ────────────────────────────
// Meta's "Instagram API with Instagram Login" connects a Business/Creator
// account straight from the Instagram app. The owner taps Connect → Instagram
// → Allow. No Facebook Page, no Facebook account. We never see a password.
//
// Tokens last 60 days and are refreshed by the worker before they lapse.

const AUTHORIZE = "https://www.instagram.com/oauth/authorize";
const TOKEN = "https://api.instagram.com/oauth/access_token";
const GRAPH = "https://graph.instagram.com";
const GRAPH_VERSION = "v21.0";
const TIMEOUT_MS = 20_000;
const STATE_TTL_MS = 10 * 60 * 1000;

/** The two permissions publishing needs. Nothing about messages or comments. */
export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
] as const;

export function isInstagramConfigured(): boolean {
  return Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
}

export function instagramRedirectUri(): string {
  const base = (process.env.APPLICATION_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/social/instagram/callback`;
}

export class InstagramOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstagramOAuthError";
  }
}

// ── CSRF state ────────────────────────────────────────────────────────────
// Round-trips through Instagram. HMAC-signed so a forged callback can't attach
// someone's account to a business they don't control.

export interface OAuthState {
  tenantSlug: string;
  nonce: string;
  exp: number;
}

function stateKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to sign OAuth state.");
  return Buffer.from(secret, "utf8");
}

export function signState(input: { tenantSlug: string }): string {
  const state: OAuthState = {
    tenantSlug: input.tenantSlug,
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
    if (!state.tenantSlug) return null;
    return state;
  } catch {
    return null;
  }
}

// ── Dialog URL ────────────────────────────────────────────────────────────

export function authorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID ?? "",
    redirect_uri: instagramRedirectUri(),
    response_type: "code",
    scope: INSTAGRAM_SCOPES.join(","),
    state,
  });
  return `${AUTHORIZE}?${params}`;
}

// ── HTTP ──────────────────────────────────────────────────────────────────

async function request<T>(
  url: string,
  init: RequestInit,
  operation: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const json = (await res.json()) as T & {
      error?: { message?: string; code?: number };
      error_message?: string;
      error_type?: string;
    };
    if (!res.ok || json.error || json.error_type) {
      log.error({
        operation,
        provider: "instagram",
        status: "error",
        error: `ig_${json.error?.code ?? json.error_type ?? res.status}`,
        durationMs: Date.now() - started,
      });
      throw new InstagramOAuthError(
        "Instagram didn't complete the connection. Make sure your account is a Business or Creator account, then try again.",
      );
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

// ── Token exchange ────────────────────────────────────────────────────────

export interface LongLivedToken {
  accessToken: string;
  /** Instagram user id the token belongs to. */
  userId: string;
  expiresAt: Date;
}

/** code → short-lived token → long-lived token (60 days). */
export async function exchangeCode(code: string): Promise<LongLivedToken> {
  const appId = process.env.INSTAGRAM_APP_ID ?? "";
  const appSecret = process.env.INSTAGRAM_APP_SECRET ?? "";

  const short = await request<{ access_token: string; user_id: string | number }>(
    TOKEN,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: instagramRedirectUri(),
        code,
      }),
    },
    "instagram.oauth.exchange_code",
  );

  const long = await request<{ access_token: string; expires_in: number }>(
    `${GRAPH}/access_token?${new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: appSecret,
      access_token: short.access_token,
    })}`,
    { method: "GET" },
    "instagram.oauth.exchange_long_lived",
  );

  return {
    accessToken: long.access_token,
    userId: String(short.user_id),
    expiresAt: expiryFromSeconds(long.expires_in),
  };
}

/** Long-lived tokens can be refreshed once they're at least 24h old and not yet expired. */
export async function refreshLongLivedToken(accessToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const result = await request<{ access_token: string; expires_in: number }>(
    `${GRAPH}/refresh_access_token?${new URLSearchParams({
      grant_type: "ig_refresh_token",
      access_token: accessToken,
    })}`,
    { method: "GET" },
    "instagram.oauth.refresh",
  );
  return { accessToken: result.access_token, expiresAt: expiryFromSeconds(result.expires_in) };
}

export function expiryFromSeconds(seconds: number | undefined): Date {
  // Instagram says 60 days; fall back to that if the field is missing.
  const secs = typeof seconds === "number" && seconds > 0 ? seconds : 60 * 24 * 3600;
  return new Date(Date.now() + secs * 1000);
}

// ── Profile ───────────────────────────────────────────────────────────────

export interface InstagramProfile {
  id: string;
  username: string;
  accountType: "BUSINESS" | "MEDIA_CREATOR" | "PERSONAL" | string;
}

export async function fetchProfile(accessToken: string): Promise<InstagramProfile> {
  const me = await request<{ id: string; username: string; account_type?: string }>(
    `${GRAPH}/${GRAPH_VERSION}/me?${new URLSearchParams({
      fields: "id,username,account_type",
      access_token: accessToken,
    })}`,
    { method: "GET" },
    "instagram.oauth.profile",
  );
  return { id: me.id, username: me.username, accountType: me.account_type ?? "UNKNOWN" };
}

/** Publishing is only allowed on professional accounts. Pure, so it's testable. */
export function canPublish(profile: InstagramProfile): boolean {
  return profile.accountType === "BUSINESS" || profile.accountType === "MEDIA_CREATOR";
}
