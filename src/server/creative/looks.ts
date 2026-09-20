import { db } from "@/server/db";
import { TEMPLATES, DEFAULT_TEMPLATE_ID } from "@/server/creative/templates";
import { photoDataUri } from "@/server/creative/photo";

// ── Look previews for the picker ──────────────────────────────────────────
// Each template rendered small, in the tenant's real brand colours, with a
// sample offer — so the owner chooses from what *their* flyer will look like,
// not from a generic thumbnail.

export interface LookPreview {
  id: string;
  name: string;
  blurb: string;
  wantsPhoto: boolean;
  /** data: URI of an SVG preview. */
  preview: string;
}

export interface PhotoChoice {
  id: string;
  filename: string;
}

export async function lookPreviews(tenantId: string, heroAssetId?: string | null): Promise<{
  looks: LookPreview[];
  photos: PhotoChoice[];
  defaultLook: string;
}> {
  const [tenant, brand, profile, photos] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    db.brandSettings.findUnique({ where: { tenantId } }),
    db.businessProfile.findUnique({ where: { tenantId } }),
    db.asset.findMany({
      where: { tenantId, kind: { in: ["IMAGE", "GENERATED"] }, sourceAssetId: null, mimeType: { not: "image/svg+xml" } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, filename: true },
    }),
  ]);

  // Preview with the chosen photo, else the most recent one, else none.
  const previewPhotoId = heroAssetId ?? photos[0]?.id ?? null;
  const photo = previewPhotoId ? await photoDataUri(previewPhotoId, 480) : null;

  const looks = TEMPLATES.map((t) => {
    const svg = t.render({
      format: "square",
      headline: "Weekend special",
      price: "₹199",
      when: "Sat & Sun",
      businessName: tenant.name,
      cta: brand?.ctaPreference ?? "Order now",
      phone: profile?.phone ?? null,
      address: null,
      brand: {
        primary: brand?.primaryColor ?? "#D6367B",
        secondary: brand?.secondaryColor ?? "#2E2447",
        accent: brand?.accentColor ?? "#F5A31C",
      },
      photo,
      watermark: null,
    });
    return {
      id: t.id,
      name: t.name,
      blurb: t.blurb,
      wantsPhoto: t.wantsPhoto,
      preview: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    };
  });

  return { looks, photos, defaultLook: brand?.flyerTemplate ?? DEFAULT_TEMPLATE_ID };
}
