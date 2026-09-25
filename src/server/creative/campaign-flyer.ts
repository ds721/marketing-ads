import { db } from "@/server/db";
import { getStorageProvider, storageKey } from "@/server/storage";
import { renderFlyerSvg, flyerSpecFromCampaign, type FlyerFormat } from "@/server/creative/flyer";
import { audit } from "@/server/audit";
import { photoDataUri } from "@/server/creative/photo";
import { ensureFonts } from "@/server/creative/fonts";
import { renderDesign } from "@/server/creative/design-renderer";
import { designSpecSchema } from "@/server/ai/schemas";
import { isImageGenerationConfigured } from "@/server/ai";
import { generateAiFlyer, type FlyerStyle } from "@/server/creative/ai-flyer";
import { log } from "@/server/logger";
import { paletteFrom } from "@/server/creative/palette";

// ── Automatic campaign creatives ──────────────────────────────────────────
// A campaign isn't done until it has something to post. The moment a
// campaign exists, every Instagram item gets a flyer in the right shape:
// square for the feed, 9:16 for stories. The owner can swap in their own
// photo, but never has to.

const FORMAT_FOR_TYPE: Record<string, FlyerFormat> = {
  STORY: "story",
  REEL: "story",
};

// The owner picks a look; the image model needs an art direction. This is the
// bridge between the two vocabularies.
const STYLE_FOR_LOOK: Record<string, FlyerStyle> = {
  bold: "bold",
  photo: "premium",
  split: "fresh",
  framed: "premium",
  blob: "festive",
  minimal: "minimal",
};

export async function createCampaignFlyers(params: {
  tenantId: string;
  campaignId: string;
  userId?: string | null;
}): Promise<{ created: number; attached: number }> {
  const { tenantId, campaignId, userId } = params;
  await ensureFonts();

  const [campaign, tenant, profile, brand, items] = await Promise.all([
    db.campaign.findFirst({ where: { id: campaignId, tenantId } }),
    db.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    db.businessProfile.findUnique({ where: { tenantId } }),
    db.brandSettings.findUnique({ where: { tenantId } }),
    db.contentItem.findMany({
      where: { tenantId, campaignId, platform: "instagram", assetId: null },
      select: { id: true, contentType: true },
    }),
  ]);
  if (!campaign || items.length === 0) return { created: 0, attached: 0 };

  // When the owner pointed at a design they like, take its colours. Without an
  // image model this is the only part of a reference we can honour — but it is
  // the part that changes the flyer most, so it works with or without credit.
  let refBrand: { primary: string; secondary: string; accent: string } | null = null;
  if (campaign.styleRefAssetId) {
    try {
      const ref = await db.asset.findFirst({
        where: { id: campaign.styleRefAssetId, tenantId },
        select: { storageKey: true, kind: true },
      });
      if (ref && ref.kind !== "VIDEO") {
        const pal = await paletteFrom(await getStorageProvider().get(ref.storageKey));
        refBrand = { primary: pal.background, secondary: pal.background2, accent: pal.accent };
      }
    } catch (err) {
      log.error({
        operation: "campaign.style_ref_palette",
        tenantId,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const spec = flyerSpecFromCampaign({
    campaignName: campaign.name,
    facts: (campaign.facts as Record<string, string | null>) ?? {},
    business: {
      name: tenant.name,
      phone: profile?.phone ?? null,
      address: profile?.address ?? null,
      city: profile?.city ?? null,
    },
    brand: refBrand ?? {
      primary: brand?.primaryColor ?? "#D6367B",
      secondary: brand?.secondaryColor ?? "#2E2447",
      accent: brand?.accentColor ?? "#F5A31C",
    },
    cta: brand?.ctaPreference ?? null,
  });

  const watermark =
    brand?.watermarkEnabled !== false
      ? {
          position: brand?.watermarkPosition ?? ("BOTTOM_RIGHT" as const),
          opacity: brand?.watermarkOpacity ?? 75,
          logoDataUri: null,
          text: brand?.watermarkText ?? tenant.name,
        }
      : null;

  const templateId = campaign.templateId ?? brand?.flyerTemplate ?? null;
  const design = designSpecSchema.safeParse(campaign.designSpec);
  let heroPhoto =
    campaign.heroAssetId &&
    (await db.asset.findFirst({ where: { id: campaign.heroAssetId, tenantId }, select: { id: true } }))
      ? await photoDataUri(campaign.heroAssetId)
      : null;

  // The design asked for a painted scene and there's no photo: let the image
  // model supply one. It draws only the background; words stay ours.
  if (!heroPhoto && design.success && design.data.backgroundPrompt && isImageGenerationConfigured()) {
    try {
      const { generateProductPhoto } = await import("@/server/creative/generate-photo");
      const assetId = await generateProductPhoto({ tenantId, userId: userId ?? "", subject: design.data.backgroundPrompt, style: "warm" });
      heroPhoto = await photoDataUri(assetId);
      await db.campaign.update({ where: { id: campaignId }, data: { heroAssetId: assetId } });
    } catch (err) {
      log.error({ operation: "campaign.ai_background", tenantId, status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  const storage = getStorageProvider();
  const byFormat = new Map<FlyerFormat, string>();
  let attached = 0;

  for (const item of items) {
    const format = FORMAT_FOR_TYPE[item.contentType] ?? "square";

    let assetId = byFormat.get(format);

    // Preferred path: the image model paints the whole creative from the
    // owner's photo — lighting, depth, foil type — then we read the result
    // back and confirm the price and phone survived intact. Anything short of
    // that falls through to the deterministic renderer below, which cannot
    // get a number wrong because it draws them itself.
    if (!assetId && isImageGenerationConfigured() && format !== "portrait") {
      try {
        const painted = await generateAiFlyer({
          tenantId,
          userId: userId ?? "",
          referenceAssetId: campaign.heroAssetId,
          styleRefAssetId: campaign.styleRefAssetId,
          brief: {
            headline: spec.headline,
            subline: spec.subhead,
            price: spec.price,
            when: spec.when,
            cta: spec.cta,
            businessName: spec.businessName,
            phone: spec.phone,
            category: profile?.category ?? null,
            style: STYLE_FOR_LOOK[templateId ?? ""] ?? "premium",
            format: format === "story" ? "story" : "square",
            brand: spec.brand,
          },
        });
        assetId = painted.assetId;
        byFormat.set(format, assetId);
      } catch (err) {
        log.info({
          operation: "campaign.ai_flyer_fallback",
          tenantId,
          status: "ok",
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!assetId) {
      const svg = design.success
        ? renderDesign(design.data, {
            format,
            headline: spec.headline,
            price: spec.price,
            when: spec.when,
            businessName: spec.businessName,
            category: profile?.category ?? null,
            cta: spec.cta,
            phone: spec.phone,
            address: spec.address,
            brand: spec.brand,
            photo: heroPhoto,
            watermark,
          })
        : renderFlyerSvg(spec, format, watermark, templateId, heroPhoto, profile?.category ?? null);
      const buf = Buffer.from(svg, "utf8");
      const key = await storage.put(
        storageKey(tenantId, `${campaign.name.slice(0, 40)}-${format}.svg`),
        buf,
        "image/svg+xml",
      );
      const asset = await db.asset.create({
        data: {
          tenantId,
          kind: "FLYER",
          filename: `${campaign.name.slice(0, 60)} — ${format}.svg`,
          mimeType: "image/svg+xml",
          sizeBytes: buf.length,
          storageKey: key,
          width: 1080,
          height: format === "square" ? 1080 : format === "portrait" ? 1350 : 1920,
          tags: ["flyer", "campaign", format, design.success ? `design:${design.data.name}` : (templateId ?? "bold")],
          watermarked: Boolean(watermark),
          createdById: userId ?? null,
        },
      });
      assetId = asset.id;
      byFormat.set(format, assetId);
    }

    await db.contentItem.update({ where: { id: item.id }, data: { assetId } });
    attached++;
  }

  await audit({
    tenantId,
    userId: userId ?? null,
    action: "asset.flyer_generate",
    targetType: "campaign",
    targetId: campaignId,
    meta: { created: byFormat.size, attached },
  });

  return { created: byFormat.size, attached };
}
