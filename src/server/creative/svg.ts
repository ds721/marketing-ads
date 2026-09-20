// ── SVG building blocks shared by every flyer template ────────────────────

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

/** Greedy word wrap into at most maxLines lines of ~maxChars. */
export function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if ((line + " " + word).length <= maxChars) line += " " + word;
    else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = lines[maxLines - 1]!.slice(0, Math.max(0, maxChars - 1)) + "…";
  }
  return lines;
}

/** Multi-line <text> block. Returns the markup and the y where the block ends. */
export function textBlock(opts: {
  lines: string[];
  x: number;
  y: number;
  size: number;
  weight?: number | string;
  fill: string;
  family?: string;
  anchor?: "start" | "middle" | "end";
  lineHeight?: number;
  letterSpacing?: number;
  italic?: boolean;
  opacity?: number;
}): { svg: string; endY: number } {
  const lh = opts.lineHeight ?? 1.08;
  const family = opts.family ?? SANS;
  const svg = opts.lines
    .map(
      (line, i) =>
        `<text x="${opts.x}" y="${opts.y + i * opts.size * lh}" text-anchor="${opts.anchor ?? "start"}" font-family="${family}" font-size="${opts.size}" font-weight="${opts.weight ?? 800}"${opts.italic ? ' font-style="italic"' : ""}${opts.letterSpacing ? ` letter-spacing="${opts.letterSpacing}"` : ""}${opts.opacity !== undefined ? ` opacity="${opts.opacity}"` : ""} fill="${opts.fill}">${esc(line)}</text>`,
    )
    .join("\n  ");
  return { svg, endY: opts.y + (opts.lines.length - 1) * opts.size * lh };
}

/** A rounded pill with centred text. Width is estimated from the text. */
export function pill(opts: {
  x: number;
  y: number;
  text: string;
  size: number;
  fill: string;
  color: string;
  anchor?: "start" | "end" | "middle";
  bold?: boolean;
}): string {
  const padX = opts.size * 0.9;
  const w = Math.round(opts.text.length * opts.size * 0.58 + padX * 2);
  const h = Math.round(opts.size * 1.9);
  const x = opts.anchor === "end" ? opts.x - w : opts.anchor === "middle" ? opts.x - w / 2 : opts.x;
  return `<rect x="${x}" y="${opts.y}" rx="${h / 2}" width="${w}" height="${h}" fill="${opts.fill}"/>
  <text x="${x + w / 2}" y="${opts.y + h * 0.66}" text-anchor="middle" font-family="${SANS}" font-size="${opts.size}" font-weight="${opts.bold === false ? 600 : 800}" fill="${opts.color}">${esc(opts.text)}</text>`;
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

export const SANS = "Helvetica Neue, Helvetica, Arial, sans-serif";
export const SERIF = "Georgia, 'Times New Roman', serif";

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
