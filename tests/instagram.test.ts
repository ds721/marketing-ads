import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import "./setup";
import {
  signState,
  verifyState,
  authorizationUrl,
  instagramRedirectUri,
  canPublish,
  expiryFromSeconds,
  INSTAGRAM_SCOPES,
} from "@/server/social/instagram-oauth";
import { publicAssetUrl, verifyPublicAssetLink } from "@/server/public-assets";

// ── Instagram Login (§21) ─────────────────────────────────────────────────
// The handshake can't run without a Meta app, but everything that protects
// tenants can be tested: a forged callback must never attach an account to a
// business the attacker doesn't control, and a Personal account must be
// refused before it's stored.

process.env.AUTH_SECRET ??= "test-secret-for-oauth-state";
process.env.INSTAGRAM_APP_ID ??= "123456";

describe("OAuth state", () => {
  it("round-trips the tenant", () => {
    const state = verifyState(signState({ tenantSlug: "glow-salon" }));
    expect(state?.tenantSlug).toBe("glow-salon");
  });

  it("rejects a tampered tenant slug", () => {
    const token = signState({ tenantSlug: "glow-salon" });
    const [payload, sig] = token.split(".");
    const forged = JSON.parse(Buffer.from(payload!, "base64url").toString());
    forged.tenantSlug = "spice-house";
    const forgedPayload = Buffer.from(JSON.stringify(forged)).toString("base64url");
    expect(verifyState(`${forgedPayload}.${sig}`)).toBeNull();
  });

  it("rejects a bad signature, missing signature and garbage", () => {
    const [payload] = signState({ tenantSlug: "glow-salon" }).split(".");
    expect(verifyState(`${payload}.notasignature`)).toBeNull();
    expect(verifyState(payload!)).toBeNull();
    expect(verifyState("")).toBeNull();
  });

  it("rejects an expired state even with a valid signature", () => {
    const expired = { tenantSlug: "glow-salon", nonce: "n", exp: Date.now() - 1000 };
    const p = Buffer.from(JSON.stringify(expired)).toString("base64url");
    const s = createHmac("sha256", process.env.AUTH_SECRET!).update(p).digest("base64url");
    expect(verifyState(`${p}.${s}`)).toBeNull();
  });

  it("uses a fresh nonce every time", () => {
    expect(signState({ tenantSlug: "x" })).not.toBe(signState({ tenantSlug: "x" }));
  });
});

describe("authorization URL", () => {
  it("goes to Instagram's own dialog, not Facebook's", () => {
    const url = new URL(authorizationUrl("state123"));
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
  });

  it("asks only for the two publishing permissions", () => {
    const url = new URL(authorizationUrl("s"));
    expect(url.searchParams.get("scope")?.split(",")).toEqual([...INSTAGRAM_SCOPES]);
    expect(INSTAGRAM_SCOPES).not.toContain("instagram_business_manage_messages");
  });

  it("carries the state and our callback", () => {
    const url = new URL(authorizationUrl("state123"));
    expect(url.searchParams.get("state")).toBe("state123");
    expect(url.searchParams.get("redirect_uri")).toBe(instagramRedirectUri());
    expect(instagramRedirectUri()).toMatch(/\/api\/social\/instagram\/callback$/);
  });
});

describe("account eligibility", () => {
  it("allows Business and Creator accounts", () => {
    expect(canPublish({ id: "1", username: "glow", accountType: "BUSINESS" })).toBe(true);
    expect(canPublish({ id: "1", username: "glow", accountType: "MEDIA_CREATOR" })).toBe(true);
  });

  it("refuses a Personal account so the owner is told before anything is stored", () => {
    expect(canPublish({ id: "1", username: "glow", accountType: "PERSONAL" })).toBe(false);
    expect(canPublish({ id: "1", username: "glow", accountType: "UNKNOWN" })).toBe(false);
  });

  it("defaults token life to 60 days if Instagram omits it", () => {
    const sixtyDays = 60 * 24 * 3600 * 1000;
    expect(expiryFromSeconds(undefined).getTime() - Date.now()).toBeGreaterThan(sixtyDays - 5000);
    expect(expiryFromSeconds(3600).getTime() - Date.now()).toBeLessThan(3700 * 1000);
  });
});

describe("signed public asset links", () => {
  // Instagram must fetch the image from us, but the tenant's library stays
  // private: only the exact asset signed, only for a limited time.
  it("verifies a link it issued", () => {
    const url = new URL(publicAssetUrl("asset_abc"));
    expect(verifyPublicAssetLink("asset_abc", url.searchParams.get("exp"), url.searchParams.get("sig"))).toBe(true);
  });

  it("does not let one asset's link open another asset", () => {
    const url = new URL(publicAssetUrl("asset_abc"));
    expect(verifyPublicAssetLink("asset_xyz", url.searchParams.get("exp"), url.searchParams.get("sig"))).toBe(false);
  });

  it("rejects an expired link and a tampered expiry", () => {
    const past = String(Date.now() - 1000);
    const sig = new URL(publicAssetUrl("asset_abc")).searchParams.get("sig");
    expect(verifyPublicAssetLink("asset_abc", past, sig)).toBe(false);
    const url = new URL(publicAssetUrl("asset_abc"));
    const farFuture = String(Number(url.searchParams.get("exp")) + 999_999_999);
    expect(verifyPublicAssetLink("asset_abc", farFuture, url.searchParams.get("sig"))).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifyPublicAssetLink("asset_abc", String(Date.now() + 1000), null)).toBe(false);
  });
});

describe("signed requests from Meta", () => {
  it("accepts a request signed with the app secret", async () => {
    process.env.INSTAGRAM_APP_SECRET = "test-app-secret";
    const { parseSignedRequest } = await import("@/server/social/instagram-oauth");
    const payload = Buffer.from(JSON.stringify({ user_id: "17841400000", algorithm: "HMAC-SHA256" })).toString("base64url");
    const sig = createHmac("sha256", "test-app-secret").update(payload).digest("base64url");
    expect(parseSignedRequest(`${sig}.${payload}`)?.user_id).toBe("17841400000");
  });

  it("ignores a forged request — nobody can disconnect or delete someone else's account", async () => {
    process.env.INSTAGRAM_APP_SECRET = "test-app-secret";
    const { parseSignedRequest } = await import("@/server/social/instagram-oauth");
    const payload = Buffer.from(JSON.stringify({ user_id: "17841400000" })).toString("base64url");
    const badSig = createHmac("sha256", "wrong-secret").update(payload).digest("base64url");
    expect(parseSignedRequest(`${badSig}.${payload}`)).toBeNull();
    expect(parseSignedRequest("garbage")).toBeNull();
    expect(parseSignedRequest("")).toBeNull();
  });
});
