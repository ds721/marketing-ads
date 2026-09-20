import { describe, it, expect, afterAll } from "vitest";
import "./setup";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { ensureJpegAsset, isInstagramAspectOk } from "@/server/creative/raster";
import { renderFlyerSvg } from "@/server/creative/flyer";
import { getStorageProvider, storageKey } from "@/server/storage";

// ── Publish-ready images ──────────────────────────────────────────────────
// Instagram only takes JPEG in a 4:5–1.91:1 window. Flyers are SVG, so the
// conversion has to be real, cached, and leave the original alone.

const db = new PrismaClient();
let tenantId: string;

afterAll(async () => {
  if (tenantId) await db.tenant.delete({ where: { id: tenantId } });
  await db.$disconnect();
});

describe("aspect ratio guard", () => {
  it("accepts square, portrait 4:5 and landscape 1.91:1", () => {
    expect(isInstagramAspectOk(1080, 1080)).toBe(true);
    expect(isInstagramAspectOk(1080, 1350)).toBe(true);
    expect(isInstagramAspectOk(1910, 1000)).toBe(true);
  });
  it("rejects a story-shaped 9:16 and an ultra-wide banner", () => {
    expect(isInstagramAspectOk(1080, 1920)).toBe(false);
    expect(isInstagramAspectOk(3000, 1000)).toBe(false);
    expect(isInstagramAspectOk(0, 0)).toBe(false);
  });
});

describe("ensureJpegAsset", () => {
  it("turns an SVG flyer into a JPEG Instagram can fetch, and caches it", async () => {
    const tenant = await db.tenant.create({ data: { slug: `raster-${Date.now()}`, name: "Raster" } });
    tenantId = tenant.id;

    const svg = renderFlyerSvg(
      {
        headline: "Test", price: "₹199", businessName: "Spice House",
        brand: { primary: "#E8492E", secondary: "#2E2447", accent: "#F5A31C" },
      },
      "square",
    );
    const key = storageKey(tenantId, "flyer.svg");
    await getStorageProvider().put(key, Buffer.from(svg), "image/svg+xml");
    const source = await db.asset.create({
      data: { tenantId, kind: "FLYER", filename: "flyer.svg", mimeType: "image/svg+xml", sizeBytes: svg.length, storageKey: key },
    });

    const jpegId = await ensureJpegAsset(source.id);
    expect(jpegId).not.toBe(source.id);

    const derived = await db.asset.findUniqueOrThrow({ where: { id: jpegId } });
    expect(derived.mimeType).toBe("image/jpeg");
    expect(derived.sourceAssetId).toBe(source.id);
    expect(derived.tenantId).toBe(tenantId);
    expect(isInstagramAspectOk(derived.width!, derived.height!)).toBe(true);

    const bytes = await getStorageProvider().get(derived.storageKey);
    expect((await sharp(bytes).metadata()).format).toBe("jpeg");

    // Second call reuses the derived asset instead of converting again.
    expect(await ensureJpegAsset(source.id)).toBe(jpegId);

    // Original untouched.
    const original = await db.asset.findUniqueOrThrow({ where: { id: source.id } });
    expect(original.mimeType).toBe("image/svg+xml");
  });

  it("returns a JPEG as-is", async () => {
    const jpeg = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#f00" } }).jpeg().toBuffer();
    const key = storageKey(tenantId, "photo.jpg");
    await getStorageProvider().put(key, jpeg, "image/jpeg");
    const asset = await db.asset.create({
      data: { tenantId, kind: "IMAGE", filename: "photo.jpg", mimeType: "image/jpeg", sizeBytes: jpeg.length, storageKey: key },
    });
    expect(await ensureJpegAsset(asset.id)).toBe(asset.id);
  });
});
