import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getStorageProvider } from "@/server/storage";
import { verifyPublicAssetLink } from "@/server/public-assets";

// Serves one asset to anyone holding a valid signed link — used so Instagram
// can fetch the image for a post. Expired or forged links get the same 404
// as a missing asset.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  if (!verifyPublicAssetLink(id, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const asset = await db.asset.findUnique({ where: { id } });
  if (!asset) return new NextResponse("Not found", { status: 404 });

  try {
    const data = await getStorageProvider().get(asset.storageKey);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(data.length),
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
