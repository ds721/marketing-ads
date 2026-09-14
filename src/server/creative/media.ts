import { spawn } from "child_process";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { log } from "@/server/logger";

// ── Media pipeline ────────────────────────────────────────────────────────
// Video probing, poster frames and watermark burn-in run through ffmpeg.
// When ffmpeg isn't on the host the product says so rather than silently
// skipping the brand mark — a video published without the owner's logo is a
// real failure, not a cosmetic one.

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";
const TIMEOUT_MS = 120_000;

export class MediaToolingUnavailableError extends Error {
  constructor() {
    super(
      "Video processing needs ffmpeg on the server. Install ffmpeg, or set FFMPEG_PATH / FFPROBE_PATH.",
    );
    this.name = "MediaToolingUnavailableError";
  }
}

function run(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${bin} timed out`));
    }, TIMEOUT_MS);

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject((err as NodeJS.ErrnoException).code === "ENOENT" ? new MediaToolingUnavailableError() : err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(-300)}`));
    });
  });
}

let cachedAvailability: boolean | null = null;

export async function isMediaToolingAvailable(): Promise<boolean> {
  if (cachedAvailability !== null) return cachedAvailability;
  try {
    await run(FFPROBE, ["-version"]);
    cachedAvailability = true;
  } catch {
    cachedAvailability = false;
  }
  return cachedAvailability;
}

export interface VideoMeta {
  durationSec: number;
  width: number;
  height: number;
}

/** Temp workspace helper — always cleans up, even when a step throws. */
async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "markit-media-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function probeVideo(data: Buffer): Promise<VideoMeta> {
  return withTempDir(async (dir) => {
    const input = join(dir, "in.mp4");
    await writeFile(input, data);
    const { stdout } = await run(FFPROBE, [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height:format=duration",
      "-of", "json",
      input,
    ]);
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{ width?: number; height?: number }>;
      format?: { duration?: string };
    };
    return {
      durationSec: Number(parsed.format?.duration ?? 0),
      width: parsed.streams?.[0]?.width ?? 0,
      height: parsed.streams?.[0]?.height ?? 0,
    };
  });
}

/** First-frame thumbnail so the library can show videos without downloading them. */
export async function extractPoster(data: Buffer): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const input = join(dir, "in.mp4");
    const output = join(dir, "poster.jpg");
    await writeFile(input, data);
    await run(FFMPEG, [
      "-v", "error",
      "-i", input,
      "-frames:v", "1",
      "-vf", "scale=640:-2",
      "-q:v", "4",
      "-y", output,
    ]);
    return readFile(output);
  });
}

export type WatermarkPosition = "TOP_LEFT" | "TOP_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_RIGHT" | "CENTER";

export interface WatermarkOptions {
  position: WatermarkPosition;
  /** 0–100 */
  opacity: number;
  /** PNG logo; takes precedence over text when present. */
  logo?: Buffer | null;
  text?: string | null;
}

/** ffmpeg overlay coordinates, inset by a margin proportional to the frame. */
function overlayXY(position: WatermarkPosition): { x: string; y: string } {
  const m = "floor(main_w*0.04)";
  switch (position) {
    case "TOP_LEFT":
      return { x: m, y: m };
    case "TOP_RIGHT":
      return { x: `main_w-overlay_w-${m}`, y: m };
    case "BOTTOM_LEFT":
      return { x: m, y: `main_h-overlay_h-${m}` };
    case "CENTER":
      return { x: "(main_w-overlay_w)/2", y: "(main_h-overlay_h)/2" };
    default:
      return { x: `main_w-overlay_w-${m}`, y: `main_h-overlay_h-${m}` };
  }
}

function textXY(position: WatermarkPosition): { x: string; y: string } {
  const m = "floor(w*0.04)";
  switch (position) {
    case "TOP_LEFT":
      return { x: m, y: m };
    case "TOP_RIGHT":
      return { x: `w-text_w-${m}`, y: m };
    case "BOTTOM_LEFT":
      return { x: m, y: `h-text_h-${m}` };
    case "CENTER":
      return { x: "(w-text_w)/2", y: "(h-text_h)/2" };
    default:
      return { x: `w-text_w-${m}`, y: `h-text_h-${m}` };
  }
}

/** Escapes ffmpeg drawtext syntax so a business name can't break the filter. */
function escapeDrawText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019").replace(/%/g, "\\%");
}

/**
 * Burns the brand mark into a video. Re-encodes video, copies audio untouched.
 */
export async function watermarkVideo(video: Buffer, options: WatermarkOptions): Promise<Buffer> {
  const alpha = Math.min(100, Math.max(0, options.opacity)) / 100;

  return withTempDir(async (dir) => {
    const input = join(dir, "in.mp4");
    const output = join(dir, "out.mp4");
    await writeFile(input, video);

    const args = ["-v", "error", "-i", input];

    if (options.logo) {
      const logoPath = join(dir, "logo.png");
      await writeFile(logoPath, options.logo);
      const { x, y } = overlayXY(options.position);
      args.push(
        "-i", logoPath,
        "-filter_complex",
        // Logo scaled to 18% of frame width, alpha applied, then composited.
        `[1:v]scale=iw*min(1\\,(main_w*0.18)/iw):-1[wm];` +
          `[wm]format=rgba,colorchannelmixer=aa=${alpha}[wma];` +
          `[0:v][wma]overlay=${x}:${y}[out]`,
        "-map", "[out]",
        "-map", "0:a?",
      );
    } else {
      const { x, y } = textXY(options.position);
      const text = escapeDrawText(options.text ?? "");
      args.push(
        "-vf",
        `drawtext=text='${text}':fontcolor=white@${alpha}:fontsize=h/22:` +
          `box=1:boxcolor=black@${alpha * 0.35}:boxborderw=12:x=${x}:y=${y}`,
      );
    }

    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "copy", "-y", output);

    const started = Date.now();
    await run(FFMPEG, args);
    log.info({
      operation: "media.watermark_video",
      status: "ok",
      durationMs: Date.now() - started,
      provider: "ffmpeg",
    });
    return readFile(output);
  });
}
