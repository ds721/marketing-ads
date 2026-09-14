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

  const key = storageKey(ctx.tenant.id, file.name);
  await getStorageProvider().put(key, buf, mime);

  const asset = await db.asset.create({
    data: {
      tenantId: ctx.tenant.id,
      kind: mime.startsWith("video") ? "VIDEO" : ("IMAGE" as AssetKind),
      filename: file.name.slice(0, 160),
      mimeType: mime,
      sizeBytes: buf.length,
      storageKey: key,
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
