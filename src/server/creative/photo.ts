import sharp from "sharp";
import { db } from "@/server/db";
import { getStorageProvider } from "@/server/storage";

// Loads a tenant image as a data: URI sized for embedding in a flyer SVG.
// Ownership is the caller's responsibility (assertTenantOwns / tenant filter).

export async function photoDataUri(assetId: string, maxEdge = 1200): Promise<string | null> {
  const asset = await db.asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.kind === "VIDEO") return null;
  try {
    const bytes = await getStorageProvider().get(asset.storageKey);
    const jpeg = await sharp(bytes)
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}
