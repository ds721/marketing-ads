import sharp from "sharp";

// ── Reading a design the owner points at ──────────────────────────────────
// When an owner says "make it look like this", the most useful thing we can
// take from their reference without an image model is its colour. We quantise
// the picture, then pick a background, a text colour and an accent that
// actually contrast — a palette lifted verbatim would often be unreadable.

export interface RefPalette {
  background: string;
  background2: string;
  text: string;
  accent: string;
}

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

/** Relative luminance, per WCAG. */
export function luminance(r: number, g: number, b: number): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

export interface Swatch {
  r: number;
  g: number;
  b: number;
  count: number;
}

/**
 * Buckets the image's pixels into a coarse colour cube and returns the
 * populated buckets, most common first. Coarse on purpose: we want "this is a
 * warm brown poster", not 4,000 near-identical browns.
 */
export async function swatches(image: Buffer, buckets = 5): Promise<Swatch[]> {
  const { data, info } = await sharp(image)
    .resize(80, 80, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const step = 256 / buckets;
  const bins = new Map<number, Swatch>();
  for (let i = 0; i + 2 < data.length; i += info.channels) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const key =
      Math.min(buckets - 1, Math.floor(r / step)) * buckets * buckets +
      Math.min(buckets - 1, Math.floor(g / step)) * buckets +
      Math.min(buckets - 1, Math.floor(b / step));
    const s = bins.get(key);
    if (s) {
      s.r += r; s.g += g; s.b += b; s.count++;
    } else {
      bins.set(key, { r, g, b, count: 1 });
    }
  }

  return [...bins.values()]
    .map((s) => ({ r: s.r / s.count, g: s.g / s.count, b: s.b / s.count, count: s.count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Turns a reference image into a usable flyer palette: its dominant colour as
 * the ground, its most colourful one as the accent, and whichever of black or
 * white actually reads on that ground.
 */
export async function paletteFrom(image: Buffer): Promise<RefPalette> {
  const found = await swatches(image);
  if (found.length === 0) {
    return { background: "#2E2447", background2: "#1B1430", text: "#FFFFFF", accent: "#F5A31C" };
  }

  const bg = found[0]!;
  const bgLum = luminance(bg.r, bg.g, bg.b);
  const dark = bgLum < 0.32;

  // The accent should be the liveliest colour that still stands out from the
  // ground — a second beige on a beige poster is not an accent.
  const accent =
    found
      .slice(1)
      .map((s) => ({
        s,
        score: saturation(s.r, s.g, s.b) * 2 + Math.abs(luminance(s.r, s.g, s.b) - bgLum),
      }))
      .sort((a, b) => b.score - a.score)[0]?.s ?? bg;

  const shift = dark ? 0.82 : 1.06;
  return {
    background: hex(bg.r, bg.g, bg.b),
    background2: hex(bg.r * shift, bg.g * shift, bg.b * shift),
    text: dark ? "#FFFFFF" : "#1B1430",
    accent: hex(accent.r, accent.g, accent.b),
  };
}
