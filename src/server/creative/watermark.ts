import type { WatermarkPosition } from "@prisma/client";
import { textPath, measure } from "@/server/creative/fonts";

// ── Image watermarking ────────────────────────────────────────────────────
// Same rule as the flyer text (§19): the brand mark is composited by us, at a
// known position and opacity, not left to a model. Output is SVG so it stays
// resolution-independent and needs no native image library.

export interface ImageWatermarkOptions {
  position: WatermarkPosition;
  opacity: number; // 0–100
  /** data: URI for the logo; falls back to text when absent. */
  logoDataUri?: string | null;
  text?: string | null;
}

interface Placement {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
}

function place(position: WatermarkPosition, w: number, h: number, margin: number): Placement {
  switch (position) {
    case "TOP_LEFT":
      return { x: margin, y: margin, anchor: "start" };
    case "TOP_RIGHT":
      return { x: w - margin, y: margin, anchor: "end" };
    case "BOTTOM_LEFT":
      return { x: margin, y: h - margin, anchor: "start" };
    case "CENTER":
      return { x: w / 2, y: h / 2, anchor: "middle" };
    default:
      return { x: w - margin, y: h - margin, anchor: "end" };
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The watermark fragment, for composing into a larger SVG (e.g. the flyer). */
export function watermarkFragment(
  options: ImageWatermarkOptions,
  canvas: { w: number; h: number },
): string {
  const { w, h } = canvas;
  const margin = Math.round(w * 0.04);
  const alpha = Math.min(100, Math.max(0, options.opacity)) / 100;

  if (options.logoDataUri) {
    const logoW = Math.round(w * 0.18);
    const logoH = Math.round(logoW * 0.5);
    const p = place(options.position, w, h, margin);
    const x = p.anchor === "end" ? p.x - logoW : p.anchor === "middle" ? p.x - logoW / 2 : p.x;
    const y = options.position.startsWith("TOP")
      ? p.y
      : options.position === "CENTER"
        ? p.y - logoH / 2
        : p.y - logoH;
    return `<image href="${esc(options.logoDataUri)}" x="${x}" y="${y}" width="${logoW}" height="${logoH}" opacity="${alpha}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  if (!options.text) return "";

  const fontSize = Math.round(w * 0.032);
  const p = place(options.position, w, h, margin);
  // Baseline sits inside the canvas for top-anchored placements.
  const y = options.position.startsWith("TOP") ? p.y + fontSize : p.y;
  // Soft dark plate behind the mark so it reads on any photo.
  const tw = measure("display", options.text, fontSize);
  const px = p.anchor === "end" ? p.x - tw : p.anchor === "middle" ? p.x - tw / 2 : p.x;
  const plate = `<rect x="${px - fontSize * 0.5}" y="${y - fontSize * 1.05}" width="${tw + fontSize}" height="${fontSize * 1.5}" rx="${fontSize * 0.5}" fill="#000" opacity="${alpha * 0.28}"/>`;
  return plate + textPath({ font: "display", text: options.text, x: p.x, y, size: fontSize, fill: "#FFFFFF", anchor: p.anchor, opacity: alpha });
}

/** Wraps an existing image in an SVG that carries the brand mark. */
export function watermarkImageSvg(
  imageDataUri: string,
  canvas: { w: number; h: number },
  options: ImageWatermarkOptions,
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.w}" height="${canvas.h}" viewBox="0 0 ${canvas.w} ${canvas.h}">
  <image href="${esc(imageDataUri)}" x="0" y="0" width="${canvas.w}" height="${canvas.h}" preserveAspectRatio="xMidYMid slice"/>
  ${watermarkFragment(options, canvas)}
</svg>`;
}
