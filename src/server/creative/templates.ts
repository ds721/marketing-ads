import {
  esc,
  fitSize,
  fitLabel,
  cleanText,
  fitHeadline,
  textBlock,
  label,
  pill,
  shade,
  isLight,
  coverImage,
  blobPath,
} from "@/server/creative/svg";
import { measure } from "@/server/creative/fonts";
import { watermarkFragment, type ImageWatermarkOptions } from "@/server/creative/watermark";
import { decorations } from "@/server/creative/decorations";

// ── Flyer templates ───────────────────────────────────────────────────────
// Six distinct looks, each with its own typeface. All text is vector outlines
// from bundled fonts (see fonts.ts) and every width is measured, so nothing
// collides and nothing depends on what fonts a server happens to have.
// §19 holds throughout: prices, dates and contact details are drawn by this
// code, never by a model.

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
  /** data: URI (server) or same-origin URL (browser preview). */
  photo?: string | null;
  /** Business category, for decorative touches (coffee beans, confetti…). */
  category?: string | null;
  watermark?: ImageWatermarkOptions | null;
}

export interface Template {
  id: string;
  name: string;
  blurb: string;
  wantsPhoto: boolean;
  render(input: TemplateInput): string;
}

const SIZES: Record<FlyerFormat, { w: number; h: number }> = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
};

function open(w: number, h: number, input: TemplateInput, defs = ""): string {
  // Text is drawn as outlines, so the facts are also written as metadata —
  // readable by screen readers, and checkable without rasterising.
  const desc = [input.headline, input.price, input.when, input.cta, input.phone, input.address]
    .filter(Boolean)
    .join(" · ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(cleanText(input.headline))}">
  <title>${esc(cleanText(input.headline))}</title><desc>${esc(desc)}</desc>
  <defs>${defs}</defs>`;
}
function close(input: TemplateInput, w: number, h: number): string {
  return `
  ${input.watermark ? watermarkFragment(input.watermark, { w, h }) : ""}
</svg>`;
}
function contact(input: TemplateInput, x: number, y: number, size: number, fill: string, anchor: "start" | "middle" | "end" = "start", maxWidth?: number): string {
  let bits = [input.phone, input.address].filter(Boolean) as string[];
  if (!bits.length) return "";
  // If both won't fit (e.g. next to a watermark), keep the phone — it's the one people act on.
  if (maxWidth && bits.length > 1 && measure("body", bits.join("   ·   "), size) > maxWidth) bits = bits.slice(0, 1);
  return label({ text: bits.join("   ·   "), x, y, size, font: "body", fill, anchor, opacity: 0.9 });
}

// ── 1. Bold — condensed caps on brand colour. Needs no photo. ─────────────

const bold: Template = {
  id: "bold",
  name: "Bold",
  blurb: "Big condensed type on your colours. Needs no photo.",
  wantsPhoto: false,
  render(input) {
    const { w, h } = SIZES[input.format];
    const { primary, secondary, accent } = input.brand;
    const pad = Math.round(w * 0.085);
    const story = input.format === "story";
    const textW = w - pad * 2;

    let svg = open(w, h, input, `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${primary}"/><stop offset="100%" stop-color="${shade(secondary, -0.1)}"/></linearGradient>`);
    svg += `<rect width="${w}" height="${h}" fill="url(#g)"/>
  <path d="${blobPath(w * 0.88, h * 0.12, w * 0.3, 3)}" fill="${accent}" opacity="0.22"/>
  <path d="${blobPath(w * 0.08, h * 0.9, w * 0.24, 7)}" fill="${accent}" opacity="0.14"/>
  ${decorations(input.category, w, h, "#fff", 0.12, 11)}
  ${label({ text: input.businessName.toUpperCase(), x: pad, y: Math.round(h * 0.09), size: Math.round(w * 0.028), font: "body", fill: "#fff", letterSpacing: w * 0.006, opacity: 0.85 })}`;

    if (input.photo) {
      const r = w * 0.15, cx = w * 0.8, cy = h * (story ? 0.14 : 0.17);
      svg += `<clipPath id="c"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>${coverImage(input.photo, cx - r, cy - r, r * 2, r * 2, "c")}<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="${w * 0.006}"/>`;
    }

    const head = fitHeadline(cleanText(input.headline).toUpperCase(), "condensed", input.photo ? textW * 0.62 : textW, 3, Math.round(w * 0.16), Math.round(w * 0.1));
    const headTop = Math.round(h * (story ? 0.3 : 0.28));
    const block = textBlock({ lines: head.lines, x: pad, y: headTop + head.size, size: head.size, font: "condensed", fill: "#fff", lineHeight: 0.95 });
    svg += block.svg;
    let y = block.endY + Math.round(h * 0.05);

    if (input.price) {
      svg += label({ text: input.price, x: pad, y: y + Math.round(w * 0.15), size: Math.round(w * 0.17), font: "display", fill: accent });
      y += Math.round(w * 0.2);
    }
    const contactY = h - pad * 0.6;
    const ctaSize = Math.round(w * 0.036);
    const ctaW = input.cta ? measure("display", input.cta, ctaSize) : 0;
    const whenSize = Math.round(w * 0.03);
    const gap = Math.round(w * 0.035);
    const rowGap = Math.round(w * 0.02);

    // Work out the shape of the when/CTA block before placing it: a long date
    // takes the whole row and drops the call to action beneath it, which makes
    // the block twice as tall. Measuring first is what keeps that second row
    // off the phone number at the foot of the flyer.
    const whenBudget = (stacked: boolean) => (stacked ? textW : textW - ctaW - gap);
    const probe = input.when
      ? pill({ x: pad, y: 0, text: input.when, size: whenSize, fill: "#fff", color: secondary, maxWidth: whenBudget(false) })
      : null;
    const roomy = textW - ctaW - gap > textW * 0.45;
    const stacked = Boolean(input.when) && !(roomy && probe !== null && probe.width + gap + ctaW <= textW);
    const ctaH = input.cta ? Math.round(ctaSize * 1.3) : 0;
    const blockH = (probe?.height ?? ctaH) + (stacked && input.cta ? rowGap + ctaH : 0);
    y = Math.min(y, contactY - blockH - Math.round(w * 0.045));

    let x = pad;
    if (input.when) {
      const p = pill({ x, y, text: input.when, size: whenSize, fill: "#fff", color: secondary, maxWidth: whenBudget(stacked) });
      svg += p.svg;
      if (stacked) y += p.height + rowGap;
      else x += p.width + gap;
    }
    if (input.cta) {
      svg += label({ text: input.cta, x, y: y + (stacked ? ctaSize : Math.round(whenSize * 1.28)), size: ctaSize, font: "display", fill: "#fff" });
    }
    svg += contact(input, pad, contactY, Math.round(w * 0.024), "#fff", "start", w * 0.7);
    return svg + close(input, w, h);
  },
};

// ── 2. Photo — full-bleed picture, text on a dark fade ────────────────────

const photo: Template = {
  id: "photo",
  name: "Photo",
  blurb: "Your photo fills the frame; the offer sits on top.",
  wantsPhoto: true,
  render(input) {
    const { w, h } = SIZES[input.format];
    const { primary, secondary, accent } = input.brand;
    const pad = Math.round(w * 0.075);
    const textW = w - pad * 2;

    let svg = open(w, h, input, `
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${secondary}" stop-opacity="0"/><stop offset="45%" stop-color="${secondary}" stop-opacity="0.15"/><stop offset="100%" stop-color="${shade(secondary, -0.3)}" stop-opacity="0.96"/></linearGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${shade(primary, -0.2)}"/><stop offset="100%" stop-color="${secondary}"/></linearGradient>`);
    svg += input.photo
      ? coverImage(input.photo, 0, 0, w, h)
      : `<rect width="${w}" height="${h}" fill="url(#bg)"/><path d="${blobPath(w * 0.7, h * 0.3, w * 0.42, 5)}" fill="${accent}" opacity="0.25"/>${decorations(input.category, w, h, "#fff", 0.14, 5)}`;
    svg += `<rect width="${w}" height="${h}" fill="url(#fade)"/>`;
    svg += pill({ x: pad, y: pad, text: input.businessName, size: Math.round(w * 0.026), fill: "#fff", color: secondary, font: "body" }).svg;

    let y = h - pad;
    if (input.phone || input.address) { svg += contact(input, pad, y, Math.round(w * 0.024), "#fff", "start", w * 0.7); y -= Math.round(h * 0.045); }
    if (input.cta) { const p = pill({ x: pad, y: y - Math.round(w * 0.075), text: input.cta, size: Math.round(w * 0.034), fill: accent, color: isLight(accent) ? secondary : "#fff" }); svg += p.svg; y -= p.height + Math.round(w * 0.035); }
    if (input.price) { svg += label({ text: input.price, x: pad, y, size: Math.round(w * 0.14), font: "display", fill: accent }); y -= Math.round(w * 0.15); }
    if (input.when) { {
        const fit = fitLabel("body", input.when.toUpperCase(), Math.round(w * 0.03), textW, 0.55, w * 0.005);
        svg += label({ text: input.when.toUpperCase(), x: pad, y, size: fit.size, font: "body", fill: "#fff", letterSpacing: fit.letterSpacing, opacity: 0.9 });
      } y -= Math.round(w * 0.055); }
    const head = fitHeadline(cleanText(input.headline), "display", textW, 3, Math.round(w * 0.09), Math.round(w * 0.06));
    svg += textBlock({ lines: head.lines, x: pad, y: y - (head.lines.length - 1) * head.size * 1.06, size: head.size, font: "display", fill: "#fff", lineHeight: 1.06 }).svg;
    return svg + close(input, w, h);
  },
};

// ── 3. Split — colour panel with a wavy edge, photo on the other side ─────

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
    const panelW = story ? w : Math.round(w * 0.56);
    const panelH = story ? Math.round(h * 0.55) : h;
    const py = story ? h - panelH : 0;
    const textFill = isLight(primary) ? secondary : "#fff";
    const textW = (story ? w : panelW) - pad * 2 - (story ? 0 : w * 0.04);
    const wave = story
      ? `M 0 ${py + 60} C ${w * 0.25} ${py - 40}, ${w * 0.6} ${py + 120}, ${w} ${py + 30} L ${w} ${h} L 0 ${h} Z`
      : `M 0 0 L ${panelW - 60} 0 C ${panelW + 40} ${h * 0.25}, ${panelW - 120} ${h * 0.6}, ${panelW + 20} ${h} L 0 ${h} Z`;

    let svg = open(w, h, input);
    svg += input.photo
      ? coverImage(input.photo, story ? 0 : panelW - 80, 0, story ? w : w - panelW + 80, story ? panelH + 100 : h)
      : `<rect width="${w}" height="${h}" fill="${shade(secondary, -0.15)}"/><path d="${blobPath(w * 0.8, h * 0.25, w * 0.3, 11)}" fill="${accent}" opacity="0.35"/>${decorations(input.category, w, h, "#fff", 0.14, 3)}`;
    svg += `<path d="${wave}" fill="${primary}"/><path d="${blobPath(panelW * 0.85, py + panelH * 0.9, w * 0.18, 4)}" fill="${accent}" opacity="0.3"/>`;

    let y = py + pad + Math.round(w * 0.03);
    svg += label({ text: input.businessName.toUpperCase(), x: pad, y, size: Math.round(w * 0.026), font: "body", fill: textFill, letterSpacing: w * 0.006, opacity: 0.8 });
    y += Math.round(h * 0.07);
    const head = fitHeadline(cleanText(input.headline), "display", textW, 3, Math.round(w * 0.085), Math.round(w * 0.055));
    const block = textBlock({ lines: head.lines, x: pad, y, size: head.size, font: "display", fill: textFill, lineHeight: 1.05 });
    svg += block.svg;
    y = block.endY + Math.round(h * 0.05);
    if (input.price) { svg += label({ text: input.price, x: pad, y: y + Math.round(w * 0.11), size: Math.round(w * 0.13), font: "display", fill: accent }); y += Math.round(w * 0.15); }
    if (input.when) { svg += label({ text: input.when, x: pad, y, size: fitSize("body", input.when, Math.round(w * 0.03), textW, 0.55), font: "body", fill: textFill }); y += Math.round(w * 0.06); }
    if (input.cta) svg += pill({ x: pad, y: Math.min(y, py + panelH - pad - Math.round(w * 0.14)), text: input.cta, size: Math.round(w * 0.03), fill: textFill, color: primary }).svg;
    svg += contact(input, pad, py + panelH - pad * 0.7, Math.round(w * 0.022), textFill);
    return svg + close(input, w, h);
  },
};

// ── 4. Framed — dark, editorial, serif italic headline ────────────────────

const framed: Template = {
  id: "framed",
  name: "Framed",
  blurb: "Dark and classy — serif headline, photo in a frame.",
  wantsPhoto: true,
  render(input) {
    const { w, h } = SIZES[input.format];
    const { primary, secondary, accent } = input.brand;
    const bg = shade(secondary, -0.35);
    const pad = Math.round(w * 0.08);
    const story = input.format === "story";
    const head = fitHeadline(cleanText(input.headline), "serif", w - pad * 2, 2, Math.round(w * 0.085), Math.round(w * 0.055));
    const brandY = pad + Math.round(w * 0.02);
    const headY = brandY + Math.round(w * 0.11);
    const headEnd = headY + (head.lines.length - 1) * head.size * 1.05;
    const fy = Math.round(headEnd + w * 0.06);
    const ctaTop = h - pad - Math.round(w * 0.085);
    const reserve = (input.price ? w * 0.17 : 0) + (input.when ? w * 0.07 : 0) + w * 0.04;
    const frameH = Math.max(Math.round(w * 0.26), Math.round(ctaTop - reserve - fy));
    const frameW = Math.min(Math.round(w * 0.64), Math.round(frameH * (story ? 0.9 : 1.5)));
    const fx = Math.round((w - frameW) / 2);

    let svg = open(w, h, input, `<clipPath id="f"><rect x="${fx}" y="${fy}" width="${frameW}" height="${frameH}" rx="${w * 0.02}"/></clipPath>`);
    svg += `<rect width="${w}" height="${h}" fill="${bg}"/>${decorations(input.category, w, h, accent, 0.35, 17)}
  ${label({ text: input.businessName.toUpperCase(), x: w / 2, y: brandY, size: Math.round(w * 0.026), font: "body", fill: "#fff", anchor: "middle", letterSpacing: w * 0.01, opacity: 0.7 })}
  ${textBlock({ lines: head.lines, x: w / 2, y: headY, size: head.size, font: "serif", fill: "#fff", anchor: "middle", lineHeight: 1.05 }).svg}`;
    svg += input.photo
      ? coverImage(input.photo, fx, fy, frameW, frameH, "f")
      : `<rect x="${fx}" y="${fy}" width="${frameW}" height="${frameH}" rx="${w * 0.02}" fill="${shade(primary, -0.1)}"/><path d="${blobPath(fx + frameW * 0.6, fy + frameH * 0.5, frameW * 0.3, 9)}" fill="${accent}" opacity="0.5"/>`;
    svg += `<rect x="${fx}" y="${fy}" width="${frameW}" height="${frameH}" rx="${w * 0.02}" fill="none" stroke="${accent}" stroke-width="${w * 0.008}"/>`;

    let y = fy + frameH + Math.round(w * 0.14);
    if (input.price) { svg += label({ text: input.price, x: w / 2, y, size: Math.round(w * 0.11), font: "display", fill: accent, anchor: "middle", letterSpacing: w * 0.004 }); y += Math.round(w * 0.06); }
    if (input.when) {
      const fit = fitLabel("body", input.when.toUpperCase(), Math.round(w * 0.028), w - pad * 2, 0.5, w * 0.012);
      svg += label({ text: input.when.toUpperCase(), x: w / 2, y, size: fit.size, font: "body", fill: "#fff", anchor: "middle", letterSpacing: fit.letterSpacing, opacity: 0.85 });
    }
    if (input.cta) svg += pill({ x: w / 2, y: ctaTop, text: input.cta, size: Math.round(w * 0.03), fill: accent, color: isLight(accent) ? bg : "#fff", anchor: "middle" }).svg;
    svg += contact(input, w / 2, h - pad * 0.55, Math.round(w * 0.022), "#fff", "middle");
    return svg + close(input, w, h);
  },
};

// ── 5. Playful — script headline, soft shapes, photo in a circle ──────────

const blob: Template = {
  id: "blob",
  name: "Playful",
  blurb: "Handwritten headline, soft shapes, fun.",
  wantsPhoto: true,
  render(input) {
    const { w, h } = SIZES[input.format];
    const { primary, secondary, accent } = input.brand;
    const pad = Math.round(w * 0.08);
    const story = input.format === "story";
    const paper = "#FFF8F1";
    const cx = w * 0.72, cy = h * (story ? 0.22 : 0.28), r = w * 0.23;

    let svg = open(w, h, input, `<clipPath id="b"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`);
    svg += `<rect width="${w}" height="${h}" fill="${paper}"/>
  <path d="${blobPath(w * 0.85, h * 0.17, w * 0.36, 2)}" fill="${accent}" opacity="0.55"/>
  <path d="${blobPath(w * 0.15, h * 0.92, w * 0.3, 6)}" fill="${primary}" opacity="0.18"/>
  <path d="${blobPath(w * 0.95, h * 0.82, w * 0.22, 8)}" fill="${secondary}" opacity="0.12"/>
  ${decorations(input.category, w, h, primary, 0.5, 23)}`;
    svg += input.photo
      ? coverImage(input.photo, cx - r, cy - r, r * 2, r * 2, "b") + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${paper}" stroke-width="${w * 0.012}"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${primary}"/>`;
    svg += label({ text: input.businessName, x: pad, y: pad + Math.round(w * 0.02), size: Math.round(w * 0.028), font: "display", fill: secondary });

    const head = fitHeadline(cleanText(input.headline), "script", w - pad * 2, 3, Math.round(w * 0.1), Math.round(w * 0.06));
    // Start below the photo circle so ascenders never touch it.
    let y = Math.max(h * (story ? 0.5 : 0.52), cy + r + head.size * 1.1);
    const block = textBlock({ lines: head.lines, x: pad, y, size: head.size, font: "script", fill: secondary, lineHeight: 1.25 });
    svg += block.svg;
    y = block.endY + Math.round(h * 0.05);

    if (input.price) {
      const sh = Math.round(w * 0.13);
      const sticker = pill({ x: pad, y, text: input.price, size: Math.round(w * 0.075), fill: primary, color: "#fff" });
      svg += `<g transform="rotate(-5 ${pad + sticker.width / 2} ${y + sh / 2})">${sticker.svg}</g>`;
      if (input.when) svg += label({ text: input.when, x: pad + sticker.width + Math.round(w * 0.04), y: y + sticker.height * 0.66, size: fitSize("hand", input.when, Math.round(w * 0.03), w - pad * 2 - sticker.width - Math.round(w * 0.04), 0.5), font: "hand", fill: secondary, opacity: 0.85 });
      y += sticker.height + Math.round(h * 0.045);
    } else if (input.when) {
      svg += label({ text: input.when, x: pad, y, size: fitSize("hand", input.when, Math.round(w * 0.032), w - pad * 2, 0.55), font: "hand", fill: secondary, opacity: 0.85 });
      y += Math.round(w * 0.06);
    }
    if (input.cta) svg += label({ text: `${input.cta} →`, x: pad, y: y + Math.round(w * 0.01), size: Math.round(w * 0.036), font: "display", fill: primary });
    svg += contact(input, pad, h - pad * 0.6, Math.round(w * 0.022), secondary, "start", w * 0.68);
    return svg + close(input, w, h);
  },
};

// ── 6. Minimal — light type, white space, one loud number ─────────────────

const minimal: Template = {
  id: "minimal",
  name: "Minimal",
  blurb: "Calm and premium. Light type, lots of space.",
  wantsPhoto: false,
  render(input) {
    const { w, h } = SIZES[input.format];
    const { primary, secondary } = input.brand;
    const pad = Math.round(w * 0.1);
    const story = input.format === "story";
    const bandH = Math.round(story ? h * 0.28 : h * 0.26);

    let svg = open(w, h, input, `<clipPath id="m"><rect x="${pad}" y="${h * 0.12}" width="${w - pad * 2}" height="${bandH}" rx="${w * 0.01}"/></clipPath>`);
    svg += `<rect width="${w}" height="${h}" fill="#FFFFFF"/>
  <rect x="${pad}" y="${pad * 0.7}" width="${w * 0.08}" height="${w * 0.006}" fill="${primary}"/>
  ${label({ text: input.businessName.toUpperCase(), x: pad, y: pad * 0.7 + Math.round(w * 0.045), size: Math.round(w * 0.024), font: "body", fill: secondary, letterSpacing: w * 0.008, opacity: 0.6 })}`;
    let y = h * 0.12;
    if (input.photo) { svg += coverImage(input.photo, pad, y, w - pad * 2, bandH, "m"); y += bandH + Math.round(h * 0.05); }
    else y = h * (story ? 0.3 : 0.28);
    const head = fitHeadline(cleanText(input.headline), "light", w - pad * 2, 3, Math.round(w * 0.07), Math.round(w * 0.048));
    const block = textBlock({ lines: head.lines, x: pad, y: y + head.size, size: head.size, font: "light", fill: secondary, lineHeight: 1.12 });
    svg += block.svg;
    y = block.endY + Math.round(h * 0.07);
    if (input.price) { svg += label({ text: input.price, x: pad, y: y + Math.round(w * 0.12), size: Math.round(w * 0.15), font: "display", fill: primary, letterSpacing: -w * 0.004 }); y += Math.round(w * 0.17); }
    if (input.when) svg += label({ text: input.when, x: pad, y, size: fitSize("body", input.when, Math.round(w * 0.028), w - pad * 2, 0.55), font: "body", fill: secondary, opacity: 0.7 });
    const footY = h - pad * 0.7;
    let fx = pad;
    if (input.cta) {
      svg += label({ text: input.cta, x: pad, y: footY, size: Math.round(w * 0.03), font: "display", fill: primary });
      svg += `<rect x="${pad}" y="${footY + w * 0.008}" width="${Math.round(w * 0.03 * input.cta.length * 0.55)}" height="${w * 0.003}" fill="${primary}"/>`;
      fx += Math.round(w * 0.03 * input.cta.length * 0.55) + Math.round(w * 0.05);
    }
    svg += contact(input, fx, footY, Math.round(w * 0.021), shade(secondary, 0.3), "start", w - fx - pad - w * 0.2);
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
