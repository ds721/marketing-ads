import { createHmac, timingSafeEqual } from "crypto";

// ── Signed public asset links ─────────────────────────────────────────────
// Instagram fetches a post's image from a URL it can reach — our asset route
// requires a login, so it can't. These links carry a short-lived HMAC so an
// asset is reachable only for the minutes a publish needs, and only the
// exact asset that was signed. Nothing about the tenant's library leaks.

const TTL_MS = 60 * 60 * 1000;

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to sign asset links.");
  return Buffer.from(secret, "utf8");
}

function sign(assetId: string, exp: number): string {
  return createHmac("sha256", key()).update(`${assetId}.${exp}`).digest("base64url");
}

export function publicAssetUrl(assetId: string): string {
  const base = (process.env.APPLICATION_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const exp = Date.now() + TTL_MS;
  return `${base}/api/public-assets/${assetId}?exp=${exp}&sig=${sign(assetId, exp)}`;
}

export function verifyPublicAssetLink(assetId: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig) return false;
  const expiry = Number(exp);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  const expected = Buffer.from(sign(assetId, expiry));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
