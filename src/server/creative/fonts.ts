import opentype, { type Font } from "opentype.js";

// ── Text as outlines ──────────────────────────────────────────────────────
// Flyer text is converted to vector paths with the bundled fonts, so the
// result is identical everywhere: the server that rasterises for Instagram,
// a Linux box with no fonts installed, and the live preview in the browser.
// It also gives exact text widths, so wrapping and pill sizes are measured
// rather than guessed.
//
// Fonts are OFL-licensed and live in /public/fonts. Server reads them from
// disk; the browser fetches the same files.

export type FontId = "display" | "light" | "body" | "condensed" | "serif" | "script" | "hand";

const FILES: Record<FontId, string> = {
  display: "bricolage.ttf", // Bricolage Grotesque ExtraBold
  light: "bricolage-light.ttf", // Bricolage Grotesque Light
  body: "bricolage-regular.ttf", // Bricolage Grotesque Medium
  condensed: "bebas.ttf", // Bebas Neue
  serif: "playfair.ttf", // Playfair Display Bold Italic
  script: "pacifico.ttf", // Pacifico
  hand: "caveat.ttf", // Caveat Bold
};

const cache = new Map<FontId, Font>();
let loading: Promise<void> | null = null;

async function loadOne(id: FontId): Promise<Font> {
  const file = FILES[id];
  let buf: ArrayBuffer;
  if (typeof window === "undefined") {
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const b = await readFile(join(process.cwd(), "public", "fonts", file));
    buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  } else {
    buf = await (await fetch(`/fonts/${file}`)).arrayBuffer();
  }
  return opentype.parse(buf);
}

/** Loads every font once. Safe to call repeatedly. */
export async function ensureFonts(): Promise<void> {
  if (cache.size === Object.keys(FILES).length) return;
  if (!loading) {
    loading = Promise.all(
      (Object.keys(FILES) as FontId[]).map(async (id) => cache.set(id, await loadOne(id))),
    ).then(() => undefined);
  }
  await loading;
}

export function fontsReady(): boolean {
  return cache.size === Object.keys(FILES).length;
}

function font(id: FontId): Font | null {
  return cache.get(id) ?? null;
}

/**
 * opentype.js 2.0's own path serialiser (toPathData) emits NaN for some
 * coordinate values. We serialise the command list ourselves — it's simple,
 * and it's the difference between a flyer and a blank one.
 */
const f2 = (n: number) => (Math.round(n * 100) / 100).toString();

function serialise(path: opentype.Path): string {
  const out: string[] = [];
  for (const c of path.commands) {
    switch (c.type) {
      case "M": out.push(`M${f2(c.x)} ${f2(c.y)}`); break;
      case "L": out.push(`L${f2(c.x)} ${f2(c.y)}`); break;
      case "Q": out.push(`Q${f2(c.x1)} ${f2(c.y1)} ${f2(c.x)} ${f2(c.y)}`); break;
      case "C": out.push(`C${f2(c.x1)} ${f2(c.y1)} ${f2(c.x2)} ${f2(c.y2)} ${f2(c.x)} ${f2(c.y)}`); break;
      case "Z": out.push("Z"); break;
    }
  }
  return out.join("");
}

/** Pair kerning, or 0 — some fonts' GPOS tables give the library NaN. */
function kern(f: Font, a: opentype.Glyph, b: opentype.Glyph): number {
  try {
    const k = f.getKerningValue(a, b);
    return Number.isFinite(k) ? k : 0;
  } catch {
    return 0;
  }
}

/**
 * Width of `text` at `size`. Walks glyphs directly (with pair kerning) rather
 * than using the library's shaper, which rejects some OpenType lookups these
 * fonts carry.
 */
export function measure(id: FontId, text: string, size: number, letterSpacing = 0): number {
  const f = font(id);
  const fallback = font("display");
  if (!f || !fallback) return text.length * size * 0.58; // estimate until fonts arrive
  let width = 0;
  let prev: opentype.Glyph | null = null;
  let prevFont: Font | null = null;
  for (const ch of text) {
    let g = f.charToGlyph(ch);
    let uf = f;
    if (g.index === 0 && ch !== " ") { g = fallback.charToGlyph(ch); uf = fallback; }
    const scale = size / uf.unitsPerEm;
    if (prev && prevFont === uf) width += kern(uf, prev, g) * scale;
    width += (g.advanceWidth ?? 0) * scale + letterSpacing;
    prev = g; prevFont = uf;
  }
  return width - (text.length ? letterSpacing : 0);
}

/**
 * One line of text as a <path>. `x` is the anchor point; `y` is the baseline.
 * Glyphs the chosen font lacks fall back to the display font so a stray
 * character never renders as a box.
 */
export function textPath(opts: {
  font: FontId;
  text: string;
  x: number;
  y: number;
  size: number;
  fill: string;
  anchor?: "start" | "middle" | "end";
  letterSpacing?: number;
  opacity?: number;
  extra?: string;
}): string {
  const f = font(opts.font);
  const fallback = font("display");
  const ls = opts.letterSpacing ?? 0;
  if (!f || !fallback) {
    // Fonts not loaded yet (first paint in the browser): plain text, same box.
    const fam = { display: "Helvetica Neue, Arial, sans-serif", light: "Helvetica Neue, Arial, sans-serif", body: "Helvetica Neue, Arial, sans-serif", condensed: "Impact, sans-serif", serif: "Georgia, serif", script: "cursive", hand: "cursive" }[opts.font];
    return `<text x="${opts.x}" y="${opts.y}" text-anchor="${opts.anchor ?? "start"}" font-family="${fam}" font-size="${opts.size}" font-weight="800"${ls ? ` letter-spacing="${ls}"` : ""}${opts.opacity !== undefined ? ` opacity="${opts.opacity}"` : ""} fill="${opts.fill}">${opts.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`;
  }

  const width = measure(opts.font, opts.text, opts.size, ls);
  const startX = opts.anchor === "end" ? opts.x - width : opts.anchor === "middle" ? opts.x - width / 2 : opts.x;

  // Build glyph by glyph: substitute missing glyphs, apply kerning and spacing.
  let cursor = startX;
  let prev: opentype.Glyph | null = null;
  let prevFont: Font | null = null;
  const d: string[] = [];
  for (const ch of opts.text) {
    let g = f.charToGlyph(ch);
    let uf = f;
    if (g.index === 0 && ch !== " ") { g = fallback.charToGlyph(ch); uf = fallback; }
    const scale = opts.size / uf.unitsPerEm;
    if (prev && prevFont === uf) cursor += kern(uf, prev, g) * scale;
    const pd = serialise(g.getPath(cursor, opts.y, opts.size));
    if (pd) d.push(pd);
    cursor += (g.advanceWidth ?? 0) * scale + ls;
    prev = g; prevFont = uf;
  }
  return `<path d="${d.join(" ")}" fill="${opts.fill}"${opts.opacity !== undefined ? ` opacity="${opts.opacity}"` : ""}${opts.extra ? ` ${opts.extra}` : ""}/>`;
}

/** Word-wrap by measured width. */
export function wrapWidth(id: FontId, text: string, size: number, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(id, candidate, size) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    let last = lines[maxLines - 1]!;
    while (last.length > 1 && measure(id, last + "…", size) > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = last + "…";
  }
  return lines;
}
