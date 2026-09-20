import { getAIProvider } from "@/server/ai";
import { buildBusinessContext } from "@/server/ai/context";
import { flyerDesignPrompt } from "@/server/ai/prompts";
import { designSetSchema, PROMPT_VERSIONS, type DesignSpec } from "@/server/ai/schemas";
import { checkEntitlement, recordUsage } from "@/server/usage";
import { ensureFonts } from "@/server/creative/fonts";
import { renderDesign } from "@/server/creative/design-renderer";
import { photoDataUri } from "@/server/creative/photo";
import { db } from "@/server/db";

// ── AI art direction ──────────────────────────────────────────────────────
// Asks the model for several distinct design directions for one flyer, then
// renders each so the owner picks from real previews in their own colours.

export interface DesignOption {
  spec: DesignSpec;
  /** data: URI SVG preview, square. */
  preview: string;
}

export async function generateDesigns(params: {
  tenantId: string;
  userId: string;
  headline: string;
  price?: string | null;
  when?: string | null;
  heroAssetId?: string | null;
  count?: number;
}): Promise<DesignOption[]> {
  const { tenantId, headline, price = null, when = null, heroAssetId = null, count = 3 } = params;

  await checkEntitlement(tenantId, "ai_text");
  await ensureFonts();

  const [ctx, profile, brand] = await Promise.all([
    buildBusinessContext(tenantId),
    db.businessProfile.findUnique({ where: { tenantId } }),
    db.brandSettings.findUnique({ where: { tenantId } }),
  ]);

  const photo = heroAssetId
    ? (await db.asset.findFirst({ where: { id: heroAssetId, tenantId }, select: { id: true } }))
      ? await photoDataUri(heroAssetId, 600)
      : null
    : null;

  const prompt = flyerDesignPrompt(ctx, { headline, price, when, hasPhoto: Boolean(photo), count });
  const result = await getAIProvider().generateStructured(
    { task: "campaign", schemaName: PROMPT_VERSIONS.flyerDesign, system: prompt.system, prompt: prompt.prompt },
    designSetSchema,
  );
  await recordUsage(tenantId, "ai_text");

  const input = {
    format: "square" as const,
    headline,
    price,
    when,
    businessName: ctx.business.name,
    category: ctx.business.category,
    cta: ctx.brand.cta ?? "Order now",
    phone: ctx.business.phone,
    address: profile?.address ?? ctx.business.city,
    brand: ctx.brand.colors,
    photo,
    watermark:
      brand?.watermarkEnabled !== false
        ? { position: brand?.watermarkPosition ?? ("BOTTOM_RIGHT" as const), opacity: brand?.watermarkOpacity ?? 75, logoDataUri: null, text: brand?.watermarkText ?? ctx.business.name }
        : null,
  };

  return result.data.designs.map((spec) => ({
    spec,
    preview: `data:image/svg+xml;base64,${Buffer.from(renderDesign(spec, input)).toString("base64")}`,
  }));
}
