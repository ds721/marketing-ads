// ── Deterministic creative layer (§18–19) ─────────────────────────────────
// The critical rule: prices, dates, phone numbers and addresses are rendered
// by THIS code, never by an image model. An image model may only ever supply
// the background art. That is what stops ₹199 becoming ₹1,999.

import { watermarkFragment, type ImageWatermarkOptions } from "@/server/creative/watermark";

export type FlyerFormat = "square" | "portrait" | "story";

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

const SIZES: Record<FlyerFormat, { w: number; h: number }> = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Break a headline into lines that fit the canvas at the given size. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
    } else if ((line + " " + word).length <= maxChars) {
      line += " " + word;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    const last = lines[maxLines - 1]!;
    lines[maxLines - 1] = last.slice(0, Math.max(0, maxChars - 1)) + "…";
  }
  return lines;
}

export function renderFlyerSvg(
  spec: FlyerSpec,
  format: FlyerFormat = "square",
  watermark: ImageWatermarkOptions | null = null,
): string {
  const { w, h } = SIZES[format];
  const pad = Math.round(w * 0.085);
  const headlineSize = Math.round(w * (format === "story" ? 0.085 : 0.095));
  const headlineLines = wrap(spec.headline.toUpperCase(), format === "story" ? 16 : 14, 3);

  // Vertical rhythm: headline block sits above the price, contact rail pinned low.
  const headlineTop = Math.round(h * (format === "story" ? 0.3 : 0.26));
  const priceY = headlineTop + headlineLines.length * headlineSize * 1.12 + Math.round(h * 0.06);
  const priceSize = Math.round(w * 0.17);
  const whenY = priceY + Math.round(h * 0.055);
  const ctaY = h - pad - Math.round(h * (spec.phone || spec.address ? 0.11 : 0.05));
  const contactY = h - pad - Math.round(h * 0.025);

  const background = spec.backgroundDataUri
    ? `<image href="${esc(spec.backgroundDataUri)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>
       <rect width="${w}" height="${h}" fill="url(#scrim)"/>`
    : `<rect width="${w}" height="${h}" fill="url(#brandGrad)"/>
       <circle cx="${w * 0.85}" cy="${h * 0.12}" r="${w * 0.28}" fill="${esc(spec.brand.accent)}" opacity="0.18"/>
       <circle cx="${w * 0.1}" cy="${h * 0.88}" r="${w * 0.22}" fill="${esc(spec.brand.accent)}" opacity="0.12"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(spec.headline)}">
  <defs>
    <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${esc(spec.brand.primary)}"/>
      <stop offset="100%" stop-color="${esc(spec.brand.secondary)}"/>
    </linearGradient>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0.25"/>
      <stop offset="60%" stop-color="#000" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.8"/>
    </linearGradient>
  </defs>
  ${background}

  <text x="${pad}" y="${Math.round(h * 0.09)}" font-family="Helvetica,Arial,sans-serif" font-size="${Math.round(w * 0.028)}" font-weight="700" letter-spacing="${w * 0.006}" fill="#FFFFFF" opacity="0.85">${esc(spec.businessName.toUpperCase())}</text>

  ${spec.subhead ? `<text x="${pad}" y="${headlineTop - Math.round(h * 0.035)}" font-family="Helvetica,Arial,sans-serif" font-size="${Math.round(w * 0.034)}" font-weight="600" fill="${esc(spec.brand.accent)}">${esc(spec.subhead)}</text>` : ""}

  ${headlineLines
    .map(
      (line, i) =>
        `<text x="${pad}" y="${headlineTop + i * headlineSize * 1.12}" font-family="Helvetica,Arial,sans-serif" font-size="${headlineSize}" font-weight="800" fill="#FFFFFF">${esc(line)}</text>`,
    )
    .join("\n  ")}

  ${
    spec.price
      ? `<text x="${pad}" y="${priceY}" font-family="Helvetica,Arial,sans-serif" font-size="${priceSize}" font-weight="800" fill="${esc(spec.brand.accent)}">${esc(spec.price)}</text>`
      : ""
  }

  ${
    spec.when
      ? `<rect x="${pad}" y="${whenY - Math.round(h * 0.032)}" rx="${Math.round(h * 0.022)}" width="${Math.min(w - pad * 2, spec.when.length * Math.round(w * 0.021) + pad)}" height="${Math.round(h * 0.048)}" fill="#FFFFFF" opacity="0.95"/>
         <text x="${pad + Math.round(w * 0.025)}" y="${whenY}" font-family="Helvetica,Arial,sans-serif" font-size="${Math.round(w * 0.031)}" font-weight="700" fill="${esc(spec.brand.secondary)}">${esc(spec.when)}</text>`
      : ""
  }

  ${
    spec.cta
      ? `<text x="${pad}" y="${ctaY}" font-family="Helvetica,Arial,sans-serif" font-size="${Math.round(w * 0.04)}" font-weight="700" fill="#FFFFFF">${esc(spec.cta)}</text>`
      : ""
  }

  ${
    spec.phone || spec.address
      ? `<text x="${pad}" y="${contactY}" font-family="Helvetica,Arial,sans-serif" font-size="${Math.round(w * 0.024)}" font-weight="500" fill="#FFFFFF" opacity="0.9">${esc([spec.phone, spec.address].filter(Boolean).join("  ·  "))}</text>`
      : ""
  }

  ${(watermark ?? spec.watermark) ? watermarkFragment((watermark ?? spec.watermark)!, { w, h }) : ""}
</svg>`;
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
    headline: facts.offerName ?? params.campaignName,
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
