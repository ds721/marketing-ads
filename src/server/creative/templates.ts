import {
  esc, cleanText, wrap, textBlock, pill, shade, isLight, coverImage, blobPath, SANS, SERIF,
} from "@/server/creative/svg";
import { watermarkFragment, type ImageWatermarkOptions } from "@/server/creative/watermark";

// ── Flyer templates ───────────────────────────────────────────────────────
// Six distinct looks. Each is a pure function of the same input, so the same
// campaign can be redrawn in any look instantly, and every one obeys §19:
// prices, dates and contact details are drawn by this code, never by a model.
// A photo makes every template better; each degrades gracefully without one.

export type FlyerFormat = "square" | "portrait" | "story";

export interface TemplateInput {
  format: FlyerFormat;
  headline: string;
  subhead?: string | null;
  price?: string | null;
  when?: string | null;
  businessName: string;
  cta?: string | null;
  phone?: string | null;
  address?: string | null;
  brand: { primary: string; secondary: string; accent: string };
  /** data: URI, already resized. */
  photo?: string | null;
  watermark?: ImageWatermarkOptions | null;
}

export interface Template {
  id: string;
  name: string;
  /** One line the owner reads when choosing. */
  blurb: string;
  /** Looks its best with a photo; still renders without one. */
  wantsPhoto: boolean;
  render(input: TemplateInput): string;
}

const SIZES: Record<FlyerFormat, { w: number; h: number }> = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
};

function open(w: number, h: number, label: string, defs = ""): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
  <defs>${defs}</defs>`;
}
function close(input: TemplateInput, w: number, h: number): string {
  return `
  ${input.watermark ? watermarkFragment(input.watermark, { w, h }) : ""}
</svg>`;
}

/** Contact footer used by several looks: phone · address, small and calm. */
function contactLine(input: TemplateInput, x: number, y: number, size: number, fill: string, anchor: "start" | "middle" | "end" = "start"): string {
  const bits = [input.phone, input.address].filter(Boolean) as string[];
  if (bits.length === 0) return "";
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${SANS}" font-size="${size}" font-weight="500" fill="${fill}" opacity="0.9">${esc(bits.join("   ·   "))}</text>`;
}

// ── 1. Bold — big type on brand colour. Works with nothing but words. ─────

const bold: Template = {
  id: "bold",
  name: "Bold",
  blurb: "Big words, your colours. Needs no photo.",
  wantsPhoto: false,
  render(input) {
    const { w, h } = SIZES[input.format];
    const { primary, secondary, accent } = input.brand;
    const pad = Math.round(w * 0.085);
    const story = input.format === "story";
    const lines = wrap(cleanText(input.headline).toUpperCase(), story ? 14 : 13, 3);
    const headSize = Math.round(w * (lines.length === 3 ? 0.088 : story ? 0.095 : 0.105));
    const headTop = Math.round(h * (story ? 0.3 : 0.3));

    let svg = open(w, h, input.headline, `
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${primary}"/><stop offset="100%" stop-color="${shade(secondary, -0.1)}"/>
    </linearGradient>`);
    svg += `<rect width="${w}" height="${h}" fill="url(#g)"/>
  <path d="${blobPath(w * 0.88, h * 0.12, w * 0.3, 3)}" fill="${accent}" opacity="0.22"/>
  <path d="${blobPath(w * 0.08, h * 0.9, w * 0.24, 7)}" fill="${accent}" opacity="0.14"/>
  <text x="${pad}" y="${Math.round(h * 0.09)}" font-family="${SANS}" font-size="${Math.round(w * 0.028)}" font-weight="700" letter-spacing="${w * 0.006}" fill="#fff" opacity="0.85">${esc(input.businessName.toUpperCase())}</text>`;

    if (input.photo) {
      const r = w * 0.15, cx = w * 0.8, cy = h * (story ? 0.14 : 0.17);
      svg += `<clipPath id="c"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
  ${coverImage(input.photo, cx - r, cy - r, r * 2, r * 2, "c")}
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="${w * 0.006}"/>`;
    }

    const head = textBlock({ lines, x: pad, y: headTop + headSize, size: headSize, fill: "#fff" });
    svg += head.svg;
    let y = head.endY + Math.round(h * 0.05);

    if (input.price) {
      svg += `<text x="${pad}" y="${y + Math.round(w * 0.15)}" font-family="${SANS}" font-size="${Math.round(w * 0.17)}" font-weight="900" fill="${accent}">${esc(input.price)}</text>`;
      y += Math.round(w * 0.2);
    }
    // "When" pill and the call to action share one row.
    let x = pad;
    if (input.when) {
      svg += pill({ x, y, text: input.when, size: Math.round(w * 0.03), fill: "#fff", color: secondary });
      x += Math.round(input.when.length * w * 0.03 * 0.58 + w * 0.03 * 1.8) + Math.round(w * 0.035);
    }
    if (input.cta) {
      svg += `<text x="${x}" y="${y + Math.round(w * 0.03 * 1.25)}" font-family="${SANS}" font-size="${Math.round(w * 0.036)}" font-weight="700" fill="#fff">${esc(input.cta)}</text>`;
    }
    svg += contactLine(input, pad, h - pad * 0.8, Math.round(w * 0.024), "#fff");
    return svg + close(input, w, h);
  },
};

// ── 2. Photo — full-bleed picture, text sits on a dark fade at the bottom ─

const photo: Template = {
  id: "photo",
  name: "Photo",
  blurb: "Your photo fills the frame; the offer sits on top.",
  wantsPhoto: true,
  render(input) {
    const { w, h } = SIZES[input.format];
    const { primary, secondary, accent } = input.brand;
    const pad = Math.round(w * 0.075);
    const story = input.format === "story";
    const lines = wrap(cleanText(input.headline), story ? 18 : 16, 3);
    const headSize = Math.round(w * (story ? 0.078 : 0.084));

    let svg = open(w, h, input.headline, `
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${secondary}" stop-opacity="0"/>
      <stop offset="45%" stop-color="${secondary}" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="${shade(secondary, -0.3)}" stop-opacity="0.96"/>
    </linearGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${shade(primary, -0.2)}"/><stop offset="100%" stop-color="${secondary}"/>
    </linearGradient>`);

    svg += input.photo
      ? coverImage(input.photo, 0, 0, w, h)
      : `<rect width="${w}" height="${h}" fill="url(#bg)"/><path d="${blobPath(w * 0.7, h * 0.3, w * 0.42, 5)}" fill="${accent}" opacity="0.25"/>`;
    svg += `<rect width="${w}" height="${h}" fill="url(#fade)"/>`;

    // top-left brand chip
    svg += pill({ x: pad, y: pad, text: input.businessName, size: Math.round(w * 0.026), fill: "#fff", color: secondary });

    const bottom = h - pad;
    let y = bottom;
    if (input.phone || input.address) { svg += contactLine(input, pad, y, Math.round(w * 0.024), "#fff"); y -= Math.round(h * 0.045); }
    if (input.cta) { svg += pill({ x: pad, y: y - Math.round(w * 0.075), text: input.cta, size: Math.round(w * 0.034), fill: accent, color: isLight(accent) ? secondary : "#fff" }); y -= Math.round(w * 0.11); }
    if (input.price) { svg += `<text x="${pad}" y="${y}" font-family="${SANS}" font-size="${Math.round(w * 0.14)}" font-weight="900" fill="${accent}">${esc(input.price)}</text>`; y -= Math.round(w * 0.15); }
    if (input.when) { svg += `<text x="${pad}" y="${y}" font-family="${SANS}" font-size="${Math.round(w * 0.032)}" font-weight="700" letter-spacing="${w * 0.004}" fill="#fff" opacity="0.9">${esc(input.when.toUpperCase())}</text>`; y -= Math.round(w * 0.055); }
    const head = textBlock({ lines, x: pad, y: y - (lines.length - 1) * headSize * 1.06, size: headSize, fill: "#fff", lineHeight: 1.06 });
    svg += head.svg;
    return svg + close(input, w, h);
  },
};

// ── 3. Split — colour panel with an organic edge, photo on the other side ──

const split: Template = {
  id: "split",
  name: "Split",
  blurb: "Half colour, half photo, with a soft wavy edge.",
  wantsPhoto: true,
  render(input) {
    const { w, h } = SIZES[input.format];
    const { primary, secondary, accent } = input.brand;
    const story = input.format === "story";
    const pad = Math.round(w * 0.08);
    // Story: panel at the bottom; square: panel on the left.
    const panelW = story ? w : Math.round(w * 0.56);
    const panelH = story ? Math.round(h * 0.55) : h;
    const px = 0, py = story ? h - panelH : 0;
    const textFill = isLight(primary) ? secondary : "#fff";

    const wave = story
      ? `M 0 ${py + 60} C ${w * 0.25} ${py - 40}, ${w * 0.6} ${py + 120}, ${w} ${py + 30} L ${w} ${h} L 0 ${h} Z`
      : `M 0 0 L ${panelW - 60} 0 C ${panelW + 40} ${h * 0.25}, ${panelW - 120} ${h * 0.6}, ${panelW + 20} ${h} L 0 ${h} Z`;

    let svg = open(w, h, input.headline, `<clipPath id="ph"><rect x="0" y="0" width="${w}" height="${h}"/></clipPath>`);
    svg += input.photo
      ? coverImage(input.photo, story ? 0 : panelW - 80, 0, story ? w : w - panelW + 80, story ? panelH + 100 : h)
      : `<rect width="${w}" height="${h}" fill="${shade(secondary, -0.15)}"/><path d="${blobPath(w * 0.8, h * 0.25, w * 0.3, 11)}" fill="${accent}" opacity="0.35"/>`;
    svg += `<path d="${wave}" fill="${primary}"/>
  <path d="${blobPath(px + panelW * 0.85, py + panelH * 0.9, w * 0.18, 4)}" fill="${accent}" opacity="0.3"/>`;

    const tx = pad, textW = story ? 20 : 12;
    let y = py + pad + Math.round(w * 0.03);
    svg += `<text x="${tx}" y="${y}" font-family="${SANS}" font-size="${Math.round(w * 0.026)}" font-weight="700" letter-spacing="${w * 0.006}" fill="${textFill}" opacity="0.8">${esc(input.businessName.toUpperCase())}</text>`;
    y += Math.round(h * 0.07);
    const headSize = Math.round(w * (story ? 0.085 : 0.075));
    const head = textBlock({ lines: wrap(cleanText(input.headline), textW, 3), x: tx, y, size: headSize, fill: textFill, lineHeight: 1.05 });
    svg += head.svg;
    y = head.endY + Math.round(h * 0.05);
    if (input.price) { svg += `<text x="${tx}" y="${y + Math.round(w * 0.11)}" font-family="${SANS}" font-size="${Math.round(w * 0.13)}" font-weight="900" fill="${accent}">${esc(input.price)}</text>`; y += Math.round(w * 0.15); }
    if (input.when) { svg += `<text x="${tx}" y="${y}" font-family="${SANS}" font-size="${Math.round(w * 0.03)}" font-weight="700" fill="${textFill}">${esc(input.when)}</text>`; y += Math.round(w * 0.06); }
    if (input.cta) svg += pill({ x: tx, y: Math.min(y, py + panelH - pad - Math.round(w * 0.14)), text: input.cta, size: Math.round(w * 0.03), fill: textFill, color: primary });
    svg += contactLine(input, tx, py + panelH - pad * 0.7, Math.round(w * 0.022), textFill);
    return svg + close(input, w, h);
  },
};

// ── 4. Framed — dark, editorial: photo in a frame, price as the hero line ──

const framed: Template = {
  id: "framed",
  name: "Framed",
  blurb: "Dark and classy — photo in a frame, price underneath.",
  wantsPhoto: true,
  render(input) {
    const { w, h } = SIZES[input.format];
    const { primary, secondary, accent } = input.brand;
    const bg = shade(secondary, -0.35);
    const pad = Math.round(w * 0.08);
    const headLines = wrap(cleanText(input.headline), 22, 2);
    const headSize = Math.round(w * 0.07);
    // Stack from the top: brand → headline → frame → price → when. Footer pinned.
    const brandY = pad + Math.round(w * 0.02);
    const headY = brandY + Math.round(w * 0.1);
    const headEnd = headY + (headLines.length - 1) * headSize * 1.05;
    const fy = Math.round(headEnd + w * 0.06);
    // Reserve the bottom for price, dates, CTA and contact; the frame gets what's left.
    const ctaTop = h - pad - Math.round(w * 0.085);
    const reserve = (input.price ? w * 0.17 : 0) + (input.when ? w * 0.07 : 0) + w * 0.04;
    const frameH = Math.max(Math.round(w * 0.26), Math.round(ctaTop - reserve - fy));
    const frameW = Math.min(Math.round(w * 0.64), Math.round(frameH * 1.5));
    const fx = Math.round((w - frameW) / 2);

    let svg = open(w, h, input.headline, `<clipPath id="f"><rect x="${fx}" y="${fy}" width="${frameW}" height="${frameH}" rx="${w * 0.02}"/></clipPath>`);
    svg += `<rect width="${w}" height="${h}" fill="${bg}"/>
  <circle cx="${w * 0.12}" cy="${h * 0.3}" r="${w * 0.03}" fill="${accent}" opacity="0.5"/>
  <circle cx="${w * 0.9}" cy="${h * 0.72}" r="${w * 0.045}" fill="${primary}" opacity="0.5"/>
  <circle cx="${w * 0.14}" cy="${h * 0.86}" r="${w * 0.02}" fill="${accent}" opacity="0.4"/>
  <text x="${w / 2}" y="${brandY}" text-anchor="middle" font-family="${SANS}" font-size="${Math.round(w * 0.026)}" font-weight="700" letter-spacing="${w * 0.01}" fill="#fff" opacity="0.7">${esc(input.businessName.toUpperCase())}</text>`;
    svg += textBlock({ lines: headLines, x: w / 2, y: headY, size: headSize, fill: "#fff", family: SERIF, italic: true, weight: 700, anchor: "middle", lineHeight: 1.05 }).svg;
    svg += input.photo
      ? coverImage(input.photo, fx, fy, frameW, frameH, "f")
      : `<rect x="${fx}" y="${fy}" width="${frameW}" height="${frameH}" rx="${w * 0.02}" fill="${shade(primary, -0.1)}"/><path d="${blobPath(fx + frameW * 0.6, fy + frameH * 0.5, frameW * 0.3, 9)}" fill="${accent}" opacity="0.5"/>`;
    svg += `<rect x="${fx}" y="${fy}" width="${frameW}" height="${frameH}" rx="${w * 0.02}" fill="none" stroke="${accent}" stroke-width="${w * 0.008}"/>`;

    let y = fy + frameH + Math.round(w * 0.14);
    if (input.price) { svg += `<text x="${w / 2}" y="${y}" text-anchor="middle" font-family="${SANS}" font-size="${Math.round(w * 0.11)}" font-weight="900" letter-spacing="${w * 0.006}" fill="${accent}">${esc(input.price)}</text>`; y += Math.round(w * 0.06); }
    if (input.when) { svg += `<text x="${w / 2}" y="${y}" text-anchor="middle" font-family="${SANS}" font-size="${Math.round(w * 0.028)}" font-weight="600" letter-spacing="${w * 0.012}" fill="#fff" opacity="0.85">${esc(input.when.toUpperCase())}</text>`; }
    if (input.cta) svg += pill({ x: w / 2, y: ctaTop, text: input.cta, size: Math.round(w * 0.03), fill: accent, color: isLight(accent) ? bg : "#fff", anchor: "middle" });
    svg += contactLine(input, w / 2, h - pad * 0.55, Math.round(w * 0.022), "#fff", "middle");
    return svg + close(input, w, h);
  },
};

// ── 5. Blob — playful, light, big shapes; photo peeks through a circle ────

const blob: Template = {
  id: "blob",
  name: "Playful",
  blurb: "Light and fun, with soft shapes in your colours.",
  wantsPhoto: true,
  render(input) {
    const { w, h } = SIZES[input.format];
    const { primary, secondary, accent } = input.brand;
    const pad = Math.round(w * 0.08);
    const story = input.format === "story";
    const paper = "#FFF8F1";
    const cx = w * 0.72, cy = h * (story ? 0.22 : 0.28), r = w * 0.23;

    let svg = open(w, h, input.headline, `<clipPath id="b"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`);
    svg += `<rect width="${w}" height="${h}" fill="${paper}"/>
  <path d="${blobPath(w * 0.85, h * 0.17, w * 0.36, 2)}" fill="${accent}" opacity="0.55"/>
  <path d="${blobPath(w * 0.15, h * 0.92, w * 0.3, 6)}" fill="${primary}" opacity="0.18"/>
  <path d="${blobPath(w * 0.95, h * 0.82, w * 0.22, 8)}" fill="${secondary}" opacity="0.12"/>`;
    if (input.photo) svg += coverImage(input.photo, cx - r, cy - r, r * 2, r * 2, "b") + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${paper}" stroke-width="${w * 0.012}"/>`;
    else svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${primary}"/>`;

    svg += `<text x="${pad}" y="${pad + Math.round(w * 0.02)}" font-family="${SANS}" font-size="${Math.round(w * 0.028)}" font-weight="800" fill="${secondary}">${esc(input.businessName)}</text>`;
    const headSize = Math.round(w * (story ? 0.085 : 0.082));
    const headLines = wrap(cleanText(input.headline), story ? 15 : 14, 3);
    let y = h * (story ? 0.5 : 0.52);
    const head = textBlock({ lines: headLines, x: pad, y, size: headSize, fill: secondary, weight: 900, lineHeight: 1.02 });
    svg += head.svg;
    y = head.endY + Math.round(h * 0.045);

    if (input.price) {
      const sh = Math.round(w * 0.13);
      const sw = Math.round(input.price.length * w * 0.058 + w * 0.07);
      svg += `<g transform="rotate(-5 ${pad + sw / 2} ${y + sh / 2})"><rect x="${pad}" y="${y}" rx="${sh / 2}" width="${sw}" height="${sh}" fill="${primary}"/><text x="${pad + sw / 2}" y="${y + sh * 0.7}" text-anchor="middle" font-family="${SANS}" font-size="${Math.round(w * 0.082)}" font-weight="900" fill="#fff">${esc(input.price)}</text></g>`;
      if (input.when) svg += `<text x="${pad + sw + Math.round(w * 0.04)}" y="${y + sh * 0.66}" font-family="${SANS}" font-size="${Math.round(w * 0.03)}" font-weight="700" fill="${secondary}" opacity="0.8">${esc(input.when)}</text>`;
      y += sh + Math.round(h * 0.045);
    } else if (input.when) {
      svg += `<text x="${pad}" y="${y}" font-family="${SANS}" font-size="${Math.round(w * 0.03)}" font-weight="700" fill="${secondary}" opacity="0.8">${esc(input.when)}</text>`;
      y += Math.round(w * 0.06);
    }
    if (input.cta) svg += `<text x="${pad}" y="${y + Math.round(w * 0.01)}" font-family="${SANS}" font-size="${Math.round(w * 0.036)}" font-weight="800" fill="${primary}">${esc(input.cta)} →</text>`;
    svg += contactLine(input, pad, h - pad * 0.6, Math.round(w * 0.022), secondary);
    return svg + close(input, w, h);
  },
};

// ── 6. Minimal — white space, thin type, the price as the only loud thing ─

const minimal: Template = {
  id: "minimal",
  name: "Minimal",
  blurb: "Calm and premium. Lots of space, one loud number.",
  wantsPhoto: false,
  render(input) {
    const { w, h } = SIZES[input.format];
    const { primary, secondary } = input.brand;
    const pad = Math.round(w * 0.1);
    const story = input.format === "story";

    const bandH = Math.round(story ? h * 0.28 : h * 0.26);
    let svg = open(w, h, input.headline, `<clipPath id="m"><rect x="${pad}" y="${h * 0.12}" width="${w - pad * 2}" height="${bandH}" rx="${w * 0.01}"/></clipPath>`);
    svg += `<rect width="${w}" height="${h}" fill="#FFFFFF"/>
  <rect x="${pad}" y="${pad * 0.7}" width="${w * 0.08}" height="${w * 0.006}" fill="${primary}"/>
  <text x="${pad}" y="${pad * 0.7 + Math.round(w * 0.045)}" font-family="${SANS}" font-size="${Math.round(w * 0.024)}" font-weight="600" letter-spacing="${w * 0.008}" fill="${secondary}" opacity="0.6">${esc(input.businessName.toUpperCase())}</text>`;
    let y = h * 0.12;
    if (input.photo) { svg += coverImage(input.photo, pad, y, w - pad * 2, bandH, "m"); y += bandH + Math.round(h * 0.05); }
    else y = h * (story ? 0.3 : 0.28);
    const headLines = wrap(cleanText(input.headline), story ? 18 : 16, 3);
    const headSize = Math.round(w * (headLines.length === 3 ? 0.06 : 0.068));
    const head = textBlock({ lines: headLines, x: pad, y: y + headSize, size: headSize, fill: secondary, weight: 300, lineHeight: 1.12 });
    svg += head.svg;
    y = head.endY + Math.round(h * 0.07);
    if (input.price) { svg += `<text x="${pad}" y="${y + Math.round(w * 0.12)}" font-family="${SANS}" font-size="${Math.round(w * 0.15)}" font-weight="800" letter-spacing="-${w * 0.004}" fill="${primary}">${esc(input.price)}</text>`; y += Math.round(w * 0.17); }
    if (input.when) { svg += `<text x="${pad}" y="${y}" font-family="${SANS}" font-size="${Math.round(w * 0.028)}" font-weight="500" fill="${secondary}" opacity="0.7">${esc(input.when)}</text>`; }
    // Footer row: CTA on the left, contact on the right.
    const footY = h - pad * 0.7;
    let fx = pad;
    if (input.cta) {
      svg += `<text x="${pad}" y="${footY}" font-family="${SANS}" font-size="${Math.round(w * 0.03)}" font-weight="700" fill="${primary}" text-decoration="underline">${esc(input.cta)}</text>`;
      fx += Math.round(input.cta.length * w * 0.03 * 0.58) + Math.round(w * 0.05);
    }
    svg += contactLine(input, fx, footY, Math.round(w * 0.021), shade(secondary, 0.3));
    return svg + close(input, w, h);
  },
};

export const TEMPLATES: Template[] = [photo, split, framed, blob, bold, minimal];
export const DEFAULT_TEMPLATE_ID = "bold";

export function getTemplate(id: string | null | undefined): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID)!;
}

export function renderTemplate(id: string | null | undefined, input: TemplateInput): string {
  return getTemplate(id).render(input);
}
