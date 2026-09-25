import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { paletteFrom, swatches, luminance } from "@/server/creative/palette";

const solid = (r: number, g: number, b: number, w = 120, h = 120) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } }).png().toBuffer();

/** A picture that is mostly `bg` with a stripe of `accent` down one side. */
async function twoTone(bg: [number, number, number], accent: [number, number, number]) {
  const base = await solid(bg[0], bg[1], bg[2], 120, 120);
  const stripe = await solid(accent[0], accent[1], accent[2], 24, 120);
  return sharp(base).composite([{ input: stripe, left: 0, top: 0 }]).png().toBuffer();
}

describe("reading a reference image's palette", () => {
  it("takes the dominant colour as the background", async () => {
    const p = await paletteFrom(await twoTone([40, 26, 20], [214, 170, 92]));
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(p.background.slice(i, i + 2), 16)) as [number, number, number];
    expect(luminance(r, g, b)).toBeLessThan(0.1); // the dark brown, not the gold
  });

  it("picks white text on a dark reference", async () => {
    const p = await paletteFrom(await twoTone([40, 26, 20], [214, 170, 92]));
    expect(p.text).toBe("#FFFFFF");
  });

  it("picks dark text on a light reference", async () => {
    const p = await paletteFrom(await twoTone([245, 242, 235], [40, 90, 60]));
    expect(p.text).toBe("#1B1430");
  });

  it("finds the accent rather than a second shade of the background", async () => {
    const p = await paletteFrom(await twoTone([40, 26, 20], [214, 170, 92]));
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(p.accent.slice(i, i + 2), 16)) as [number, number, number];
    expect(r).toBeGreaterThan(150); // gold, clearly not the brown
    expect(luminance(r, g, b)).toBeGreaterThan(0.25);
  });

  it("always returns valid hex", async () => {
    const p = await paletteFrom(await twoTone([12, 90, 140], [250, 210, 40]));
    for (const c of [p.background, p.background2, p.text, p.accent]) {
      expect(c).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("copes with a single flat colour", async () => {
    const p = await paletteFrom(await solid(200, 30, 60));
    expect(p.background).toMatch(/^#[0-9A-F]{6}$/);
    expect(p.text).toMatch(/^#(FFFFFF|1B1430)$/);
  });

  it("buckets coarsely so near-identical shades collapse", async () => {
    const s = await swatches(await twoTone([40, 26, 20], [44, 30, 24]));
    expect(s.length).toBeLessThanOrEqual(2);
  });
});
