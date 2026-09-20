import { db } from "@/server/db";
import { getStorageProvider, storageKey } from "@/server/storage";
import { renderFlyerSvg, flyerSpecFromCampaign, type FlyerFormat } from "@/server/creative/flyer";
import { audit } from "@/server/audit";

// ── Automatic campaign creatives ──────────────────────────────────────────
// A campaign isn't done until it has something to post. The moment a
// campaign exists, every Instagram item gets a flyer in the right shape:
// square for the feed, 9:16 for stories. The owner can swap in their own
// photo, but never has to.

const FORMAT_FOR_TYPE: Record<string, FlyerFormat> = {
  STORY: "story",
  REEL: "story",
};

export async function createCampaignFlyers(params: {
  tenantId: string;
  campaignId: string;
  userId?: string | null;
}): Promise<{ created: number; attached: number }> {
  const { tenantId, campaignId, userId } = params;

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

  const spec = flyerSpecFromCampaign({
    campaignName: campaign.name,
    facts: (campaign.facts as Record<string, string | null>) ?? {},
    business: {
      name: tenant.name,
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

  const storage = getStorageProvider();
  const byFormat = new Map<FlyerFormat, string>();
  let attached = 0;

  for (const item of items) {
    const format = FORMAT_FOR_TYPE[item.contentType] ?? "square";

    let assetId = byFormat.get(format);
    if (!assetId) {
      const svg = renderFlyerSvg(spec, format, watermark);
      const buf = Buffer.from(svg, "utf8");
      const key = storageKey(tenantId, `${campaign.name.slice(0, 40)}-${format}.svg`);
      await storage.put(key, buf, "image/svg+xml");
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
          tags: ["flyer", "campaign", format],
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
