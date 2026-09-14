import { describe, it, expect } from "vitest";
import "./setup";
import { encryptSecret, decryptSecret } from "@/server/crypto";
import { sniffMime, ALLOWED_MIME, storageKey } from "@/server/storage";

// ── Token encryption and upload validation (§21, §33) ────────────────────

describe("secret encryption", () => {
  it("round-trips a token without exposing it in the ciphertext", () => {
    const token = "EAAG1234-a-real-looking-oauth-token";
    const enc = encryptSecret(token);
    expect(enc).not.toContain(token);
    expect(decryptSecret(enc)).toBe(token);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("refuses tampered ciphertext rather than returning garbage", () => {
    const enc = encryptSecret("secret-value");
    const [iv, tag, data] = enc.split(".");
    const tampered = [iv, tag, Buffer.from("evil").toString("base64url")].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
    expect(() => decryptSecret(`${data}.${tag}.${iv}`)).toThrow();
  });
});

describe("upload validation", () => {
  it("identifies real file types from magic numbers", () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(8),
    ]);
    expect(sniffMime(png)).toBe("image/png");

    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(12)]);
    expect(sniffMime(jpeg)).toBe("image/jpeg");
  });

  it("rejects a script that merely claims to be an image", () => {
    const evil = Buffer.from('<?php system($_GET["c"]); ?>');
    const sniffed = sniffMime(evil);
    expect(sniffed === null || !ALLOWED_MIME.has(sniffed)).toBe(true);
  });

  it("scopes every storage key under its tenant and strips path traversal", () => {
    const key = storageKey("tenant_abc", "../../etc/passwd");
    expect(key.startsWith("tenant_abc/")).toBe(true);
    expect(key).not.toContain("..");
  });
});
