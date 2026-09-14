import { describe, it, expect } from "vitest";
import "./setup";
import { MockAIProvider } from "@/server/ai/providers/mock";
import { videoScriptSchema, PROMPT_VERSIONS } from "@/server/ai/schemas";
import { watermarkFragment, watermarkImageSvg } from "@/server/creative/watermark";
import { isMediaToolingAvailable, probeVideo, extractPoster, watermarkVideo } from "@/server/creative/media";
import { execFileSync } from "child_process";

// ── Short video planning and brand watermarking ───────────────────────────

const provider = new MockAIProvider();

describe("video script generation", () => {
  it("produces a shootable plan that satisfies the schema", async () => {
    const result = await provider.generateStructured(
      {
        task: "content",
        schemaName: PROMPT_VERSIONS.videoScript,
        system: "s",
        prompt: `Plan it.

BUSINESS CONTEXT (JSON):
${JSON.stringify({
          business: { name: "Spice House", city: "Chennai", category: "Restaurant" },
          brand: { cta: "Order now" },
          idea: { text: "Mutton biryani for ₹320" },
        })}`,
      },
      videoScriptSchema,
    );

    const script = result.data;
    expect(script.shots.length).toBeGreaterThan(1);
    // Shots must be ordered and individually short enough to film.
    expect(script.shots.map((s) => s.order)).toEqual([...script.shots.map((s) => s.order)].sort((a, b) => a - b));
    expect(script.shots.every((s) => s.seconds > 0 && s.seconds <= 30)).toBe(true);
    expect(script.caption).toContain("Spice House");
    expect(script.hook.length).toBeGreaterThan(0);
    expect(["reel", "story", "short"]).toContain(script.format);
  });

  it("carries the owner's stated price into the caption unchanged", async () => {
    const result = await provider.generateStructured(
      {
        task: "content",
        schemaName: PROMPT_VERSIONS.videoScript,
        system: "s",
        prompt: `Plan it.

BUSINESS CONTEXT (JSON):
${JSON.stringify({
          business: { name: "Spice House", city: "Chennai" },
          idea: { text: "Mutton biryani for ₹320" },
        })}`,
      },
      videoScriptSchema,
    );
    for (const amount of result.data.caption.match(/₹[\d,]+/g) ?? []) {
      expect(amount).toBe("₹320");
    }
  });
});

describe("image watermarking", () => {
  const canvas = { w: 1080, h: 1080 };

  it("anchors the mark to the requested corner", () => {
    const right = watermarkFragment(
      { position: "BOTTOM_RIGHT", opacity: 75, text: "Spice House" },
      canvas,
    );
    expect(right).toContain('text-anchor="end"');

    const left = watermarkFragment(
      { position: "TOP_LEFT", opacity: 75, text: "Spice House" },
      canvas,
    );
    expect(left).toContain('text-anchor="start"');

    const centre = watermarkFragment(
      { position: "CENTER", opacity: 60, text: "Spice House" },
      canvas,
    );
    expect(centre).toContain('text-anchor="middle"');
  });

  it("applies opacity as a fraction", () => {
    const fragment = watermarkFragment({ position: "CENTER", opacity: 40, text: "Mark" }, canvas);
    expect(fragment).toContain('opacity="0.4"');
  });

  it("prefers a logo over the text mark when one exists", () => {
    const fragment = watermarkFragment(
      { position: "BOTTOM_RIGHT", opacity: 100, logoDataUri: "data:image/png;base64,AAA", text: "Ignored" },
      canvas,
    );
    expect(fragment).toContain("<image");
    expect(fragment).not.toContain("Ignored");
  });

  it("renders nothing when there is neither logo nor text", () => {
    expect(watermarkFragment({ position: "CENTER", opacity: 75 }, canvas)).toBe("");
  });

  it("escapes the mark so a business name can't break the SVG", () => {
    const svg = watermarkImageSvg("data:image/png;base64,AAA", canvas, {
      position: "CENTER",
      opacity: 75,
      text: '</text><script>alert("x")</script>',
    });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;");
  });
});

// ffmpeg is a host dependency; skip rather than fail where it isn't installed.
const hasFfmpeg = await isMediaToolingAvailable();

describe.skipIf(!hasFfmpeg)("video pipeline (ffmpeg)", () => {
  function testClip(): Buffer {
    return execFileSync(
      "ffmpeg",
      [
        "-v", "error",
        "-f", "lavfi", "-i", "testsrc=size=360x640:rate=15:duration=2",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-f", "mp4", "-movflags", "frag_keyframe+empty_moov", "pipe:1",
      ],
      { maxBuffer: 32 * 1024 * 1024 },
    );
  }

  it("reads real duration and dimensions", async () => {
    const meta = await probeVideo(testClip());
    expect(meta.width).toBe(360);
    expect(meta.height).toBe(640);
    expect(meta.durationSec).toBeGreaterThan(1.5);
  });

  it("extracts a poster frame", async () => {
    const poster = await extractPoster(testClip());
    // JPEG magic number — a real image, not an empty file.
    expect(poster.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it("burns in the brand mark and keeps the video playable", async () => {
    const original = testClip();
    const branded = await watermarkVideo(original, {
      position: "BOTTOM_RIGHT",
      opacity: 75,
      text: "Spice House",
    });
    expect(branded.length).toBeGreaterThan(0);
    const meta = await probeVideo(branded);
    expect(meta.width).toBe(360);
    expect(meta.durationSec).toBeGreaterThan(1.5);
  }, 60_000);
});
