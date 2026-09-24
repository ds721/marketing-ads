import { textPath, measure, wrapWidth, type FontId } from "@/server/creative/fonts";

// ── SVG building blocks shared by every flyer template ────────────────────
// All text goes through textPath → vector outlines from bundled fonts, so a
// flyer looks the same on every machine and every width is measured.

export type { FontId };

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Strip the quote marks owners type around an offer: "Biryani combo" → Biryani combo */
export function cleanText(s: string): string {
  return s
    .trim()
    .replace(/^["'“”‘’]+/, "")
    .replace(/["'“”‘’]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word-wrap to a pixel width using the real font metrics. */
export function wrap(text: string, font: FontId, size: number, maxWidth: number, maxLines: number): string[] {
  return wrapWidth(font, text, size, maxWidth, maxLines);
}

/**
 * Fit a headline: shrink the size until it wraps into `maxLines` at `maxWidth`.
 * Returns the lines and the size that made them fit.
 */
export function fitHeadline(
  text: string,
  font: FontId,
  maxWidth: number,
  maxLines: number,
  startSize: number,
  minSize: number,
): { lines: string[]; size: number } {
  let size = startSize;
  while (size > minSize) {
    const lines = wrapWidth(font, text, size, maxWidth, maxLines + 1);
    if (lines.length <= maxLines && !lines[lines.length - 1]?.endsWith("…")) return { lines, size };
    size = Math.round(size * 0.92);
  }
  return { lines: wrapWidth(font, text, minSize, maxWidth, maxLines), size: minSize };
}

/** Multi-line block. `y` is the first baseline. Returns markup and the last baseline. */
export function textBlock(opts: {
  lines: string[];
  x: number;
  y: number;
  size: number;
  font: FontId;
  fill: string;
  anchor?: "start" | "middle" | "end";
  lineHeight?: number;
  letterSpacing?: number;
  opacity?: number;
}): { svg: string; endY: number } {
  const lh = opts.lineHeight ?? 1.08;
  const svg = opts.lines
    .map((line, i) =>
      textPath({
        font: opts.font,
        text: line,
        x: opts.x,
        y: opts.y + i * opts.size * lh,
        size: opts.size,
        fill: opts.fill,
        anchor: opts.anchor,
        letterSpacing: opts.letterSpacing,
        opacity: opts.opacity,
      }),
    )
    .join("\n  ");
  return { svg, endY: opts.y + (opts.lines.length - 1) * opts.size * lh };
}

/** One line of text. */
/**
 * The largest size at or below `size` at which `text` fits `maxWidth`.
 *
 * Owners write timing in whatever length suits them — "Sunday" or "Every
 * Tuesday & Wednesday, 1 October – 31 October" — and both have to sit on one
 * line without running off the canvas or over the call to action.
 */
export function fitSize(
  font: FontId,
  text: string,
  size: number,
  maxWidth: number,
  minRatio = 0.62,
  letterSpacing = 0,
): number {
  return fitLabel(font, text, size, maxWidth, minRatio, letterSpacing).size;
}

/**
 * As `fitSize`, but also scales the tracking down with the type. Wide letter
 * spacing on a long line is what pushed text off the canvas: at 0.012em over
 * 48 characters it adds more width than the glyphs themselves.
 */
export function fitLabel(
  font: FontId,
  text: string,
  size: number,
  maxWidth: number,
  minRatio = 0.62,
  letterSpacing = 0,
): { size: number; letterSpacing: number } {
  if (maxWidth <= 0 || !text) return { size, letterSpacing };
  const min = Math.max(1, size * minRatio);
  let s = size;
  while (s > min && measure(font, text, s, letterSpacing * (s / size)) > maxWidth) s -= 1;
  const fitted = Math.max(Math.round(s), Math.round(min));
  return { size: fitted, letterSpacing: letterSpacing * (fitted / size) };
}

export function label(opts: {
  text: string;
  x: number;
  y: number;
  size: number;
  font: FontId;
  fill: string;
  anchor?: "start" | "middle" | "end";
  letterSpacing?: number;
  opacity?: number;
}): string {
  return textPath(opts);
}

/** A rounded pill sized to its text. Returns markup and its width. */
export function pill(opts: {
  x: number;
  y: number;
  text: string;
  size: number;
  fill: string;
  color: string;
  font?: FontId;
  anchor?: "start" | "end" | "middle";
  /** Shrink the text to keep the pill within this width. */
  maxWidth?: number;
}): { svg: string; width: number; height: number } {
  const font = opts.font ?? "display";
  // Shrink rather than overflow when the caller gives a width budget.
  const size = opts.maxWidth
    ? fitSize(font, opts.text, opts.size, opts.maxWidth - opts.size * 1.8)
    : opts.size;
  const padX = size * 0.9;
  const w = Math.round(measure(font, opts.text, size) + padX * 2);
  const h = Math.round(size * 1.9);
  const x = opts.anchor === "end" ? opts.x - w : opts.anchor === "middle" ? opts.x - w / 2 : opts.x;
  const svg = `<rect x="${x}" y="${opts.y}" rx="${h / 2}" width="${w}" height="${h}" fill="${opts.fill}"/>
  ${textPath({ font, text: opts.text, x: x + w / 2, y: opts.y + h * 0.68, size, fill: opts.color, anchor: "middle" })}`;
  return { svg, width: w, height: h };
}

/** Mixes a hex colour toward white (t>0) or black (t<0). */
export function shade(hex: string, t: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const to = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  const m = (c: number) => Math.round(c + (to - c) * k);
  return `#${((1 << 24) + (m(r) << 16) + (m(g) << 8) + m(b)).toString(16).slice(1)}`;
}

/** Relative luminance, for choosing readable text on a fill. */
export function isLight(hex: string): boolean {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6;
}

/** An <image> that fills a box, cover-style, optionally clipped. */
export function coverImage(dataUri: string, x: number, y: number, w: number, h: number, clipId?: string): string {
  return `<image href="${esc(dataUri)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"${clipId ? ` clip-path="url(#${clipId})"` : ""}/>`;
}

/** Organic blob path around a centre, deterministic from a seed. */
export function blobPath(cx: number, cy: number, r: number, seed = 1, points = 8): string {
  let a = seed * 9301 + 49297;
  const rnd = () => ((a = (a * 9301 + 49297) % 233280) / 233280);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < points; i++) {
    const ang = (i / points) * Math.PI * 2;
    const rr = r * (0.82 + rnd() * 0.36);
    pts.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr]);
  }
  let d = `M ${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 0; i < points; i++) {
    const p0 = pts[(i - 1 + points) % points]!, p1 = pts[i]!, p2 = pts[(i + 1) % points]!, p3 = pts[(i + 2) % points]!;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d + " Z";
}
