// ── Deterministic creative layer (§18–19) ─────────────────────────────────
// The critical rule: prices, dates, phone numbers and addresses are rendered
// by THIS code, never by an image model. An image model may only ever supply
// the background art. That is what stops ₹199 becoming ₹1,999.

import type { ImageWatermarkOptions } from "@/server/creative/watermark";
import { renderTemplate, type FlyerFormat } from "@/server/creative/templates";
import { cleanText } from "@/server/creative/svg";

export type { FlyerFormat };

export interface FlyerSpec {
  headline: string;
  subhead?: string | null;
  /** Verbatim from the owner — rendered as given, never reformatted. */
  price?: string | null;
  when?: string | null;
  businessName: string;
  cta?: string | null;
  phone?: string | null;
  address?: string | null;
  brand: { primary: string; secondary: string; accent: string };
  /** Optional data: URI for an AI- or owner-supplied background image. */
  backgroundDataUri?: string | null;
  /** Brand mark burned onto the creative; omitted when the tenant turns it off. */
  watermark?: ImageWatermarkOptions | null;
}

/**
 * Renders a flyer in the given look. Kept as the single entry point so every
 * caller — campaigns, previews, tests — goes through the same template set.
 */
export function renderFlyerSvg(
  spec: FlyerSpec,
  format: FlyerFormat = "square",
  watermark: ImageWatermarkOptions | null = null,
  templateId: string | null = null,
  photo: string | null = null,
  category: string | null = null,
): string {
  return renderTemplate(templateId, {
    category,
    format,
    headline: spec.headline,
    subhead: spec.subhead,
    price: spec.price,
    when: spec.when,
    businessName: spec.businessName,
    cta: spec.cta,
    phone: spec.phone,
    address: spec.address,
    brand: spec.brand,
    photo: photo ?? spec.backgroundDataUri ?? null,
    watermark: watermark ?? spec.watermark ?? null,
  });
}

/**
 * Build the flyer spec from campaign facts. Only facts the owner actually
 * stated reach the canvas — nothing is filled in by inference (§42).
 */
export function flyerSpecFromCampaign(params: {
  campaignName: string;
  facts: Record<string, string | null>;
  business: { name: string; phone: string | null; address: string | null; city: string | null };
  brand: { primary: string; secondary: string; accent: string };
  cta: string | null;
}): FlyerSpec {
  const { facts } = params;
  return {
    headline: cleanText(facts.offerName ?? params.campaignName),
    subhead: facts.discount ?? null,
    price: facts.price ?? null,
    when: facts.daysOrTimes ?? ([facts.startDate, facts.endDate].filter(Boolean).join(" – ") || null),
    businessName: params.business.name,
    cta: params.cta,
    phone: params.business.phone,
    address: params.business.address ?? params.business.city,
    brand: params.brand,
  };
}
