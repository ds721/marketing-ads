import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import { join, dirname } from "path";
import { randomBytes } from "crypto";

// ── Storage provider abstraction ──────────────────────────────────────────
// "local" writes under ./storage (dev). "s3" is the production shape; it stays
// unimplemented rather than silently pretending to upload.

export interface StorageProvider {
  readonly name: string;
  /**
   * Stores the bytes and returns the key to persist on the record. Local
   * returns the key it was given; cloud drivers return the canonical URL,
   * so `get`/`delete` work without a second lookup.
   */
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class NotConfiguredStorageError extends Error {
  constructor(driver: string) {
    super(`Storage driver "${driver}" is not configured. Use STORAGE_DRIVER=local for development.`);
    this.name = "NotConfiguredStorageError";
  }
}

class LocalStorageProvider implements StorageProvider {
  readonly name = "local";
  private root = join(process.cwd(), "storage");

  private path(key: string): string {
    // Keys are generated server-side, but never trust one to escape the root.
    if (key.includes("..")) throw new Error("Invalid storage key.");
    return join(this.root, key);
  }

  async put(key: string, data: Buffer): Promise<string> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
    return key;
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.path(key)).catch(() => undefined);
  }
}

/**
 * Vercel Blob. Serverless filesystems are read-only, so anything deployed
 * there must store files off-box. Keys are the blob URL, which is what the
 * asset record keeps.
 */
class BlobStorageProvider implements StorageProvider {
  readonly name = "blob";

  /**
   * On Vercel with a connected store the SDK authenticates itself (OIDC), so
   * an explicit token is optional. Elsewhere — a local run, another host —
   * BLOB_READ_WRITE_TOKEN is required.
   */
  private auth(): { token?: string } {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (token) return { token };
    if (process.env.VERCEL || process.env.BLOB_STORE_ID) return {};
    throw new NotConfiguredStorageError("blob");
  }

  async put(key: string, data: Buffer, contentType: string): Promise<string> {
    const { put } = await import("@vercel/blob");
    const result = await put(key, data, {
      access: "public",
      contentType,
      ...this.auth(),
      // Our keys already carry a random segment; keep them stable so a
      // re-render replaces rather than piles up.
      addRandomSuffix: false,
    });
    return result.url;
  }

  async get(key: string): Promise<Buffer> {
    // Keys are URLs for this driver; a legacy local key can't be served here.
    if (!/^https?:\/\//.test(key)) throw new Error("This file predates cloud storage.");
    const res = await fetch(key);
    if (!res.ok) throw new Error(`Blob fetch failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    if (!/^https?:\/\//.test(key)) return;
    const { del } = await import("@vercel/blob");
    await del(key, this.auth());
  }
}

class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  async put(): Promise<string> {
    throw new NotConfiguredStorageError("s3");
  }
  async get(): Promise<Buffer> {
    throw new NotConfiguredStorageError("s3");
  }
  async delete(): Promise<void> {
    throw new NotConfiguredStorageError("s3");
  }
}

export function getStorageProvider(): StorageProvider {
  switch (process.env.STORAGE_DRIVER ?? "local") {
    case "blob":
      return new BlobStorageProvider();
    case "s3":
      return new S3StorageProvider();
    default:
      return new LocalStorageProvider();
  }
}

/** Tenant-scoped key. Tenant id is the first path segment, always. */
export function storageKey(tenantId: string, filename: string): string {
  const safe = filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    // Collapse dot runs so no key can carry a ".." segment into a path.
    .replace(/\.{2,}/g, ".")
    .slice(-80);
  return `${tenantId}/${Date.now()}-${randomBytes(6).toString("hex")}-${safe}`;
}

// ── Upload validation (§33) ───────────────────────────────────────────────

export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
]);

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Magic-number check — never trust the declared MIME type alone. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP")
    return "image/webp";
  if (buf.subarray(0, 3).toString("ascii") === "GIF") return "image/gif";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    return brand.startsWith("qt") ? "video/quicktime" : "video/mp4";
  }
  return null;
}
