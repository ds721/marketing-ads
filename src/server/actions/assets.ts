"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireTenant, assertTenantOwns } from "@/server/tenant";
import {
  getStorageProvider,
  storageKey,
  sniffMime,
  ALLOWED_MIME,
  MAX_UPLOAD_BYTES,
} from "@/server/storage";
import { checkEntitlement, recordUsage } from "@/server/usage";
import { UsageLimitError } from "@/server/usage";
import { audit } from "@/server/audit";
import { renderFlyerSvg, flyerSpecFromCampaign } from "@/server/creative/flyer";
import {
  probeVideo,
  extractPoster,
  watermarkVideo,
  isMediaToolingAvailable,
  MediaToolingUnavailableError,
} from "@/server/creative/media";
import { log } from "@/server/logger";
import type { FormState } from "@/server/actions/auth";
import type { AssetKind } from "@prisma/client";

export async function uploadAssetAction(
  slug: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTenant(slug, "EDITOR");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: `That file is too big. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  // Trust the bytes, not the browser-declared type.
  const mime = sniffMime(buf);
  if (!mime || !ALLOWED_MIME.has(mime)) {
    return { error: "That file type isn't supported. Use a JPG, PNG, WEBP, GIF or MP4." };
  }

  try {
    await checkEntitlement(ctx.tenant.id, "storage_mb", Math.ceil(buf.length / (1024 * 1024)) || 1);
  } catch (err) {
    if (err instanceof UsageLimitError) {
      return { error: "You've used all the storage on your plan. Remove some files or upgrade." };
    }
    throw err;
  }

  const storage = getStorageProvider();
  const key = storageKey(ctx.tenant.id, file.name);
  await storage.put(key, buf, mime);

  const isVideo = mime.startsWith("video");
  let durationSec: number | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let posterKey: string | null = null;

  if (isVideo) {
    // Probing is best-effort: a video without a poster is still a usable
    // asset, so a missing ffmpeg must not fail the owner's upload.
    try {
      const meta = await probeVideo(buf);
      durationSec = meta.durationSec || null;
      width = meta.width || null;
      height = meta.height || null;

      const poster = await extractPoster(buf);
      posterKey = `${key}.poster.jpg`;
      await storage.put(posterKey, poster, "image/jpeg");
    } catch (err) {
      posterKey = null;
      log.error({
        operation: "asset.video_probe",
        tenantId: ctx.tenant.id,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const asset = await db.asset.create({
    data: {
      tenantId: ctx.tenant.id,
      kind: isVideo ? "VIDEO" : ("IMAGE" as AssetKind),
      filename: file.name.slice(0, 160),
      mimeType: mime,
      sizeBytes: buf.length,
      storageKey: key,
      durationSec,
      width,
      height,
      posterKey,
      createdById: ctx.userId,
    },
  });

  await recordUsage(ctx.tenant.id, "storage_mb", Math.ceil(buf.length / (1024 * 1024)) || 1);
  await audit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "asset.upload",
    targetType: "asset",
    targetId: asset.id,
  });

  revalidatePath(`/app/${slug}/assets`);
  return { ok: true, message: "Uploaded." };
}

export async function deleteAssetAction(slug: string, assetId: string): Promise<void> {
  const ctx = await requireTenant(slug, "EDITOR");
  const asset = await db.asset.findUnique({ where: { id: assetId } });
  assertTenantOwns(ctx, asset);

  await getStorageProvider().delete(asset.storageKey);
  await db.asset.delete({ where: { id: asset.id } });
  await audit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "asset.delete",
    targetType: "asset",
    targetId: asset.id,
  });
  revalidatePath(`/app/${slug}/assets`);
}

export async function renameAssetAction(
  slug: string,
  assetId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTenant(slug, "EDITOR");
  const asset = await db.asset.findUnique({ where: { id: assetId } });
  assertTenantOwns(ctx, asset);
  const filename = String(formData.get("filename") ?? "").trim().slice(0, 160);
  if (!filename) return { error: "Give the file a name." };
  await db.asset.update({ where: { id: asset.id }, data: { filename } });
  revalidatePath(`/app/${slug}/assets`);
  return { ok: true };
}

/**
 * Generate the campaign flyer. Text is drawn deterministically by our renderer
 * from the campaign's locked facts — the image model never touches it (§19).
 */
export async function generateFlyerAction(slug: string, campaignId: string): Promise<void> {
  const ctx = await requireTenant(slug, "EDITOR");
  const [campaign, profile, brand] = await Promise.all([
    db.campaign.findUnique({ where: { id: campaignId } }),
    db.businessProfile.findUnique({ where: { tenantId: ctx.tenant.id } }),
    db.brandSettings.findUnique({ where: { tenantId: ctx.tenant.id } }),
  ]);
  assertTenantOwns(ctx, campaign);

  const watermark =
    brand?.watermarkEnabled && (brand.watermarkText || ctx.tenant.name)
      ? {
          position: brand.watermarkPosition,
          opacity: brand.watermarkOpacity,
          // A logo asset would be embedded here as a data: URI; until one is
          // uploaded we fall back to the tenant's own name as a text mark.
          logoDataUri: null,
          text: brand.watermarkText ?? ctx.tenant.name,
        }
      : null;

  const svg = renderFlyerSvg(
    flyerSpecFromCampaign({
      campaignName: campaign.name,
      facts: (campaign.facts as Record<string, string | null>) ?? {},
      business: {
        name: ctx.tenant.name,
        phone: profile?.phone ?? null,
        address: profile?.address ?? null,
        city: profile?.city ?? null,
      },
      brand: {
        primary: brand?.primaryColor ?? "#D6367B",
        secondary: brand?.secondaryColor ?? "#2E2447",
        accent: brand?.accentColor ?? "#F5A31C",
      },
      cta: brand?.ctaPreference ?? null,
    }),
    "square",
    watermark,
  );

  const buf = Buffer.from(svg, "utf8");
  const key = storageKey(ctx.tenant.id, `${campaign.name.slice(0, 40)}-flyer.svg`);
  await getStorageProvider().put(key, buf, "image/svg+xml");

  const asset = await db.asset.create({
    data: {
      tenantId: ctx.tenant.id,
      kind: "FLYER",
      filename: `${campaign.name.slice(0, 60)} — flyer.svg`,
      mimeType: "image/svg+xml",
      sizeBytes: buf.length,
      storageKey: key,
      width: 1080,
      height: 1080,
      tags: ["flyer", "campaign"],
      createdById: ctx.userId,
    },
  });

  await audit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "asset.flyer_generate",
    targetType: "asset",
    targetId: asset.id,
    meta: { campaignId },
  });

  revalidatePath(`/app/${slug}/campaigns/${campaignId}`);
  revalidatePath(`/app/${slug}/assets`);
}

/**
 * Burns the tenant's brand mark into a video and stores it as a new asset —
 * the original is never overwritten, so the owner can re-run it after
 * changing their logo or watermark position.
 */
export async function watermarkVideoAction(slug: string, assetId: string): Promise<FormState> {
  const ctx = await requireTenant(slug, "EDITOR");
  const [asset, brand] = await Promise.all([
    db.asset.findUnique({ where: { id: assetId } }),
    db.brandSettings.findUnique({ where: { tenantId: ctx.tenant.id } }),
  ]);
  assertTenantOwns(ctx, asset);

  if (asset.kind !== "VIDEO") return { error: "That file isn't a video." };
  if (asset.watermarked) return { error: "This video already carries your brand mark." };
  if (!(await isMediaToolingAvailable())) {
    return {
      error:
        "Video branding needs ffmpeg on the server. Until it's installed we can't burn your logo into videos — images and flyers still work.",
    };
  }

  const storage = getStorageProvider();
  let output: Buffer;
  try {
    const source = await storage.get(asset.storageKey);
    const logo = brand?.logoAssetId
      ? await (async () => {
          const logoAsset = await db.asset.findFirst({
            where: { id: brand.logoAssetId!, tenantId: ctx.tenant.id },
          });
          return logoAsset ? storage.get(logoAsset.storageKey) : null;
        })()
      : null;

    output = await watermarkVideo(source, {
      position: brand?.watermarkPosition ?? "BOTTOM_RIGHT",
      opacity: brand?.watermarkOpacity ?? 75,
      logo,
      text: brand?.watermarkText ?? ctx.tenant.name,
    });
  } catch (err) {
    if (err instanceof MediaToolingUnavailableError) return { error: err.message };
    log.error({
      operation: "asset.watermark_video",
      tenantId: ctx.tenant.id,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "We couldn't add your brand mark to this video. The original is untouched." };
  }

  const key = storageKey(ctx.tenant.id, `branded-${asset.filename}`);
  await storage.put(key, output, asset.mimeType);

  const branded = await db.asset.create({
    data: {
      tenantId: ctx.tenant.id,
      kind: "VIDEO",
      filename: `Branded — ${asset.filename}`.slice(0, 160),
      mimeType: asset.mimeType,
      sizeBytes: output.length,
      storageKey: key,
      durationSec: asset.durationSec,
      width: asset.width,
      height: asset.height,
      posterKey: asset.posterKey,
      sourceAssetId: asset.id,
      watermarked: true,
      tags: [...asset.tags, "branded"],
      createdById: ctx.userId,
    },
  });

  await recordUsage(ctx.tenant.id, "storage_mb", Math.ceil(output.length / (1024 * 1024)) || 1);
  await audit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "asset.watermark_video",
    targetType: "asset",
    targetId: branded.id,
    meta: { sourceAssetId: asset.id },
  });

  revalidatePath(`/app/${slug}/assets`);
  return { ok: true, message: "Your brand mark is on it." };
}

export async function tagAssetAction(
  slug: string,
  assetId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTenant(slug, "EDITOR");
  const asset = await db.asset.findUnique({ where: { id: assetId } });
  assertTenantOwns(ctx, asset);

  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);

  await db.asset.update({ where: { id: asset.id }, data: { tags } });
  revalidatePath(`/app/${slug}/assets`);
  return { ok: true, message: "Tags saved." };
}
