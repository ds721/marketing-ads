import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import "./setup";
import {
  signState,
  verifyState,
  accountsFromPages,
  authorizationUrl,
  metaRedirectUri,
  META_SCOPES,
} from "@/server/social/meta-oauth";

// ── Meta OAuth (§21) ──────────────────────────────────────────────────────
// The handshake can't be exercised without a Meta app, but the parts that
// protect tenants can: a forged callback must never attach an account to a
// business the attacker doesn't control.

process.env.AUTH_SECRET ??= "test-secret-for-oauth-state";
process.env.META_APP_ID ??= "123456";

describe("OAuth state", () => {
  it("round-trips the tenant and provider", () => {
    const token = signState({ tenantSlug: "glow-salon", provider: "instagram" });
    const state = verifyState(token);
    expect(state?.tenantSlug).toBe("glow-salon");
    expect(state?.provider).toBe("instagram");
  });

  it("rejects a tampered tenant slug", () => {
    const token = signState({ tenantSlug: "glow-salon", provider: "instagram" });
    const [payload, sig] = token.split(".");
    const forged = JSON.parse(Buffer.from(payload!, "base64url").toString());
    forged.tenantSlug = "spice-house";
    const forgedPayload = Buffer.from(JSON.stringify(forged)).toString("base64url");
    expect(verifyState(`${forgedPayload}.${sig}`)).toBeNull();
  });

  it("rejects a bad signature, a missing signature and garbage", () => {
    const token = signState({ tenantSlug: "glow-salon", provider: "facebook" });
    const [payload] = token.split(".");
    expect(verifyState(`${payload}.notasignature`)).toBeNull();
    expect(verifyState(payload!)).toBeNull();
    expect(verifyState("")).toBeNull();
    expect(verifyState("a.b.c")).toBeNull();
  });

  it("rejects an expired state", () => {
    const token = signState({ tenantSlug: "glow-salon", provider: "instagram" });
    const [payload, sig] = token.split(".");
    const expired = JSON.parse(Buffer.from(payload!, "base64url").toString());
    expired.exp = Date.now() - 1000;
    // Re-sign with the real key so only the expiry check can fail it.
    const p2 = Buffer.from(JSON.stringify(expired)).toString("base64url");
    const s2 = createHmac("sha256", process.env.AUTH_SECRET!).update(p2).digest("base64url");
    expect(verifyState(`${p2}.${s2}`)).toBeNull();
    void sig;
  });

  it("uses a fresh nonce every time", () => {
    const a = signState({ tenantSlug: "x", provider: "instagram" });
    const b = signState({ tenantSlug: "x", provider: "instagram" });
    expect(a).not.toBe(b);
  });
});

describe("authorization URL", () => {
  it("asks Meta for exactly the publishing permissions and nothing more", () => {
    const url = new URL(authorizationUrl("state123"));
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v21.0/dialog/oauth");
    expect(url.searchParams.get("scope")?.split(",")).toEqual([...META_SCOPES]);
    expect(url.searchParams.get("state")).toBe("state123");
    expect(url.searchParams.get("redirect_uri")).toBe(metaRedirectUri());
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("points the callback at our own domain", () => {
    expect(metaRedirectUri()).toMatch(/\/api\/social\/meta\/callback$/);
  });
});

describe("account discovery", () => {
  it("maps a Page with a linked Instagram account into two publishable accounts", () => {
    const accounts = accountsFromPages([
      {
        id: "page1",
        name: "Glow Salon",
        access_token: "PAGE_TOKEN",
        instagram_business_account: { id: "ig1", username: "glowsalon" },
      },
    ]);
    expect(accounts).toHaveLength(2);
    const ig = accounts.find((a) => a.provider === "instagram");
    const fb = accounts.find((a) => a.provider === "facebook");
    expect(fb?.accountId).toBe("page1");
    expect(ig?.accountId).toBe("ig1");
    expect(ig?.accountName).toBe("@glowsalon");
    // Instagram publishes with the Page token — the same one, not a new secret.
    expect(ig?.accessToken).toBe("PAGE_TOKEN");
  });

  it("returns only Facebook when no Instagram is linked — so the UI can explain why", () => {
    const accounts = accountsFromPages([
      { id: "page1", name: "Spice House", access_token: "T", instagram_business_account: null },
    ]);
    expect(accounts.map((a) => a.provider)).toEqual(["facebook"]);
  });

  it("returns nothing for a user with no Pages", () => {
    expect(accountsFromPages([])).toEqual([]);
  });

  it("handles several Pages", () => {
    const accounts = accountsFromPages([
      { id: "p1", name: "Branch A", access_token: "A", instagram_business_account: { id: "i1" } },
      { id: "p2", name: "Branch B", access_token: "B" },
    ]);
    expect(accounts).toHaveLength(3);
    // Instagram with no username falls back to the Page name.
    expect(accounts.find((a) => a.accountId === "i1")?.accountName).toBe("Branch A");
  });
});
