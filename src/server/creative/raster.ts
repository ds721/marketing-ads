import sharp from "sharp";
import { db } from "@/server/db";
import { getStorageProvider, storageKey } from "@/server/storage";

// ── Publish-ready images ──────────────────────────────────────────────────
// Instagram accepts JPEG only, within a 4:5 – 1.91:1 aspect ratio. Our flyers
// are SVG (deterministic, resolution-independent) and owners upload PNGs and
// WEBPs. This derives a JPEG once per asset and remembers it, so the original
// stays untouched and the conversion never runs twice.

const MAX_EDGE = 1440;

export async function ensureJpegAsset(assetId: string): Promise<string> {
  const source = await db.asset.findUniqueOrThrow({ where: { id: assetId } });
  if (source.mimeType === "image/jpeg") return source.id;

  const existing = await db.asset.findFirst({
    where: { tenantId: source.tenantId, sourceAssetId: source.id, mimeType: "image/jpeg" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const storage = getStorageProvider();
  const input = await storage.get(source.storageKey);

  const image = sharp(input, { density: 144 })
    .flatten({ background: "#ffffff" })
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true });

  const jpeg = await image.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const meta = await sharp(jpeg).metadata();

  const key = await storage.put(
    storageKey(source.tenantId, source.filename.replace(/\.[a-z0-9]+$/i, "") + ".jpg"),
    jpeg,
    "image/jpeg",
  );

  const derived = await db.asset.create({
    data: {
      tenantId: source.tenantId,
      kind: source.kind === "FLYER" ? "FLYER" : "GENERATED",
      filename: source.filename.replace(/\.[a-z0-9]+$/i, "") + ".jpg",
      mimeType: "image/jpeg",
      sizeBytes: jpeg.length,
      storageKey: key,
      width: meta.width ?? null,
      height: meta.height ?? null,
      sourceAssetId: source.id,
      watermarked: source.watermarked,
      tags: [...source.tags, "publish-ready"],
      createdById: source.createdById,
    },
  });
  return derived.id;
}

/** Instagram rejects anything outside 4:5 … 1.91:1. Pure, so it's testable. */
export function isInstagramAspectOk(width: number, height: number): boolean {
  if (!width || !height) return false;
  const ratio = width / height;
  return ratio >= 0.8 - 1e-6 && ratio <= 1.91 + 1e-6;
}
