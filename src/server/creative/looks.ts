import { db } from "@/server/db";
import { TEMPLATES, DEFAULT_TEMPLATE_ID } from "@/server/creative/templates";
import { photoDataUri } from "@/server/creative/photo";
import { ensureFonts } from "@/server/creative/fonts";

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

export interface PreviewContext {
  businessName: string;
  category: string | null;
  brand: { primary: string; secondary: string; accent: string };
  cta: string | null;
  phone: string | null;
  address: string | null;
  watermark: { position: "TOP_LEFT" | "TOP_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_RIGHT" | "CENTER"; opacity: number; text: string } | null;
}

export async function lookPreviews(tenantId: string, heroAssetId?: string | null): Promise<{
  looks: LookPreview[];
  photos: PhotoChoice[];
  defaultLook: string;
  context: PreviewContext;
}> {
  await ensureFonts();
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
      category: profile?.category ?? null,
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

  const brandColors = {
    primary: brand?.primaryColor ?? "#D6367B",
    secondary: brand?.secondaryColor ?? "#2E2447",
    accent: brand?.accentColor ?? "#F5A31C",
  };

  return {
    looks,
    photos,
    defaultLook: brand?.flyerTemplate ?? DEFAULT_TEMPLATE_ID,
    context: {
      businessName: tenant.name,
      category: profile?.category ?? null,
      brand: brandColors,
      cta: brand?.ctaPreference ?? null,
      phone: profile?.phone ?? null,
      address: profile?.address ?? profile?.city ?? null,
      watermark:
        brand?.watermarkEnabled !== false
          ? { position: brand?.watermarkPosition ?? "BOTTOM_RIGHT", opacity: brand?.watermarkOpacity ?? 75, text: brand?.watermarkText ?? tenant.name }
          : null,
    },
  };
}
