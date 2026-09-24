import type { DesignSpec } from "@/server/ai/schemas";
import {
  esc,
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
import { watermarkFragment } from "@/server/creative/watermark";
import { decorations } from "@/server/creative/decorations";
import type { TemplateInput, FlyerFormat } from "@/server/creative/templates";

// ── Design renderer ───────────────────────────────────────────────────────
// Turns an AI-authored DesignSpec into a flyer. The spec is the art
// direction; this is the press. Every word — headline, price, dates, phone —
// is placed here from the locked facts, so the design can be anything and
// the ₹199 is still exactly ₹199.

const SIZES: Record<FlyerFormat, { w: number; h: number }> = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
};

/** Relative luminance 0–1. */
function lum(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

/**
 * The model chooses colours; we guarantee legibility. If its text colour
 * won't read on its background, swap to white or near-black — whichever is
 * further away — rather than ship an unreadable flyer.
 */
function readableText(spec: DesignSpec, onPhoto: boolean): string {
  const bg = onPhoto ? shade(spec.palette.background, -0.5) : spec.palette.background;
  if (contrast(spec.palette.text, bg) >= 4) return spec.palette.text;
  return isLight(bg) ? "#1B1430" : "#FFFFFF";
}

function shape(sh: DesignSpec["shapes"][number], w: number, h: number, i: number): string {
  const cx = sh.x * w, cy = sh.y * h, r = (sh.size * w) / 2;
  const rot = sh.rotate ? ` transform="rotate(${sh.rotate} ${cx} ${cy})"` : "";
  switch (sh.type) {
    case "circle":
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${sh.color}" opacity="${sh.opacity}"/>`;
    case "ring":
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${sh.color}" stroke-width="${r * 0.18}" opacity="${sh.opacity}"/>`;
    case "blob":
      return `<path d="${blobPath(cx, cy, r, i + 3)}" fill="${sh.color}" opacity="${sh.opacity}"/>`;
    case "stripe":
      return `<rect x="${cx - r}" y="${cy - r * 0.12}" width="${r * 2}" height="${r * 0.24}" rx="${r * 0.12}" fill="${sh.color}" opacity="${sh.opacity}"${rot}/>`;
    case "wave":
      return `<path d="M ${cx - r} ${cy} C ${cx - r / 2} ${cy - r * 0.4}, ${cx + r / 2} ${cy + r * 0.4}, ${cx + r} ${cy} L ${cx + r} ${cy + r * 0.5} L ${cx - r} ${cy + r * 0.5} Z" fill="${sh.color}" opacity="${sh.opacity}"${rot}/>`;
    case "arc":
      return `<path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="${sh.color}" stroke-width="${r * 0.14}" stroke-linecap="round" opacity="${sh.opacity}"${rot}/>`;
  }
}

export function renderDesign(spec: DesignSpec, input: TemplateInput): string {
  const { w, h } = SIZES[input.format];
  const story = input.format === "story";
  const pad = Math.round(w * 0.08);
  const { palette, layout, typography } = spec;
  const hasPhoto = Boolean(input.photo) && layout.photo !== "none";
  const photoFull = hasPhoto && (layout.photo === "full");
  const textFill = readableText(spec, photoFull);
  const accent = palette.accent;
  const accentText = isLight(accent) ? "#1B1430" : "#FFFFFF";
  const align = layout.align;
  const ax = align === "center" ? w / 2 : pad;
  const anchor = align === "center" ? "middle" as const : "start" as const;

  const desc = [input.headline, input.price, input.when, input.cta, input.phone, input.address].filter(Boolean).join(" · ");
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(cleanText(input.headline))}">
  <title>${esc(cleanText(input.headline))}</title><desc>${esc(desc)}</desc>
  <defs>
    <linearGradient id="bg" gradientTransform="rotate(${spec.background.angle ?? 135} 0.5 0.5)"><stop offset="0%" stop-color="${palette.background}"/><stop offset="100%" stop-color="${palette.background2}"/></linearGradient>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000" stop-opacity="${(spec.background.overlay ?? 0.5) * 0.4}"/><stop offset="100%" stop-color="#000" stop-opacity="${Math.min(0.92, (spec.background.overlay ?? 0.5) + 0.3)}"/></linearGradient>
    <clipPath id="circ"><circle cx="${w * 0.74}" cy="${h * (story ? 0.2 : 0.26)}" r="${w * 0.22}"/></clipPath>
    <clipPath id="frame"><rect x="${w * 0.18}" y="${h * (story ? 0.16 : 0.14)}" width="${w * 0.64}" height="${story ? h * 0.3 : w * 0.42}" rx="${w * 0.02}"/></clipPath>
    <clipPath id="halfR"><rect x="${w * 0.5}" y="0" width="${w * 0.5}" height="${h}"/></clipPath>
    <clipPath id="halfT"><rect x="0" y="0" width="${w}" height="${h * 0.48}"/></clipPath>
  </defs>`;

  // Background
  svg += spec.background.kind === "solid"
    ? `<rect width="${w}" height="${h}" fill="${palette.background}"/>`
    : `<rect width="${w}" height="${h}" fill="url(#bg)"/>`;

  // Photo, by treatment
  let photoBottom = 0; // y below which the text stack may start when the photo is on top
  if (hasPhoto && input.photo) {
    switch (layout.photo) {
      case "full":
        svg += coverImage(input.photo, 0, 0, w, h) + `<rect width="${w}" height="${h}" fill="url(#scrim)"/>`;
        break;
      case "half-right":
        svg += coverImage(input.photo, w * 0.5, 0, w * 0.5, h, "halfR");
        break;
      case "half-top":
        svg += coverImage(input.photo, 0, 0, w, h * 0.48, "halfT");
        photoBottom = h * 0.48;
        break;
      case "circle":
        svg += coverImage(input.photo, w * 0.52, h * (story ? 0.2 : 0.26) - w * 0.22, w * 0.44, w * 0.44, "circ") + `<circle cx="${w * 0.74}" cy="${h * (story ? 0.2 : 0.26)}" r="${w * 0.22}" fill="none" stroke="${textFill}" stroke-opacity="0.5" stroke-width="${w * 0.008}"/>`;
        photoBottom = layout.stack === "top" ? 0 : h * (story ? 0.2 : 0.26) + w * 0.22;
        break;
      case "frame":
        svg += coverImage(input.photo, w * 0.18, h * (story ? 0.16 : 0.14), w * 0.64, story ? h * 0.3 : w * 0.42, "frame") + `<rect x="${w * 0.18}" y="${h * (story ? 0.16 : 0.14)}" width="${w * 0.64}" height="${story ? h * 0.3 : w * 0.42}" rx="${w * 0.02}" fill="none" stroke="${accent}" stroke-width="${w * 0.008}"/>`;
        photoBottom = h * (story ? 0.16 : 0.14) + (story ? h * 0.3 : w * 0.42);
        break;
    }
  }

  // Shapes (behind text, after photo so they can overlap it softly)
  svg += spec.shapes.map((s, i) => shape(s, w, h, i)).join("");
  if (spec.decor === "auto") svg += decorations(input.category, w, h, accent, 0.28, 29);

  // ── Text stack ──
  // Everything below is sized as a unit and shrunk until it fits between the
  // photo/brand line and the contact line — the model picks the style, the
  // renderer guarantees it fits.
  const textW = layout.photo === "half-right" ? w * 0.5 - pad * 1.5 : w - pad * 2;
  const headCase = typography.headlineCase === "upper" ? cleanText(input.headline).toUpperCase() : cleanText(input.headline);
  const headFont = typography.headline;
  const lh = headFont === "script" ? 1.25 : headFont === "condensed" ? 0.95 : 1.06;
  const gap = Math.round(w * 0.035);
  const contactH = input.phone || input.address ? Math.round(w * 0.06) : 0;
  const brandH = Math.round(w * 0.026);
  const top = Math.max(pad + brandH + gap * 1.5, photoBottom + gap);
  const bottom = h - pad - contactH;
  const room = bottom - top;

  let scale = typography.headlineScale;
  let head = { lines: [] as string[], size: 0 };
  let headH = 0, priceSize = 0, stackH = Infinity;
  for (let i = 0; i < 8 && stackH > room; i++) {
    const baseSize = w * (headFont === "condensed" ? 0.15 : headFont === "script" ? 0.1 : 0.095) * scale;
    head = fitHeadline(headCase, headFont, textW, 3, Math.round(baseSize), Math.round(w * 0.045));
    headH = head.size + (head.lines.length - 1) * head.size * lh;
    priceSize = Math.round((layout.price === "big" ? w * 0.16 : w * 0.08) * Math.min(1, scale + 0.15));
    const priceH = input.price ? (layout.price === "big" ? priceSize : Math.round(priceSize * 1.9)) + gap : 0;
    const whenH = input.when ? Math.round(w * 0.032) + gap : 0;
    const ctaH = input.cta ? Math.round(w * 0.03 * 1.9) + gap : 0;
    stackH = headH + gap + priceH + whenH + ctaH;
    scale *= 0.88;
  }
  let y =
    layout.stack === "top" ? top
    : layout.stack === "bottom" ? Math.max(top, bottom - stackH)
    : Math.max(top, Math.min(bottom - stackH, (top + bottom - stackH) / 2));

  // Brand name
  svg += label({ text: input.businessName.toUpperCase(), x: ax, y: pad + Math.round(w * 0.02), size: Math.round(w * 0.024), font: "body", fill: textFill, anchor, letterSpacing: w * 0.008, opacity: 0.8 });

  // Headline
  svg += textBlock({ lines: head.lines, x: ax, y: y + head.size * 0.85, size: head.size, font: headFont, fill: textFill, anchor, lineHeight: lh }).svg;
  y += headH + gap;

  // Price
  if (input.price) {
    if (layout.price === "big") {
      svg += label({ text: input.price, x: ax, y: y + priceSize * 0.85, size: priceSize, font: "display", fill: accent, anchor });
      y += priceSize + gap;
    } else {
      const p = pill({ x: ax, y, text: input.price, size: priceSize, fill: layout.price === "tag" ? textFill : accent, color: layout.price === "tag" ? palette.background : accentText, anchor: anchor === "middle" ? "middle" : "start" });
      svg += layout.price === "sticker" ? `<g transform="rotate(-5 ${ax + (anchor === "middle" ? 0 : p.width / 2)} ${y + p.height / 2})">${p.svg}</g>` : p.svg;
      y += p.height + gap;
    }
  }
  // When
  if (input.when) {
    const whenText = typography.headlineCase === "upper" ? input.when.toUpperCase() : input.when;
    const whenFit = fitLabel(typography.body, whenText, Math.round(w * 0.03), w - pad * 2, 0.55, typography.headlineCase === "upper" ? w * 0.004 : 0);
    svg += label({ text: whenText, x: ax, y: y + Math.round(w * 0.026), size: whenFit.size, font: typography.body, fill: textFill, anchor, letterSpacing: whenFit.letterSpacing, opacity: 0.9 });
    y += Math.round(w * 0.032) + gap;
  }
  // CTA
  if (input.cta) {
    const bg = textFill === "#FFFFFF" ? "#FFFFFF" : palette.accent2;
    const fg = textFill === "#FFFFFF" ? shade(palette.background, -0.4) : (isLight(palette.accent2) ? "#1B1430" : "#FFFFFF");
    svg += pill({ x: ax, y, text: input.cta, size: Math.round(w * 0.03), fill: bg, color: fg, anchor: anchor === "middle" ? "middle" : "start" }).svg;
  }
  // Contact
  const bits = [input.phone, input.address].filter(Boolean) as string[];
  if (bits.length) {
    let text = bits.join("   ·   ");
    if (measure("body", text, Math.round(w * 0.022)) > w * 0.66) text = bits[0]!;
    svg += label({ text, x: ax, y: h - pad * 0.6, size: Math.round(w * 0.022), font: "body", fill: textFill, anchor, opacity: 0.85 });
  }

  svg += input.watermark ? watermarkFragment(input.watermark, { w, h }) : "";
  return svg + "\n</svg>";
}
