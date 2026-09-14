import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/tenant";
import { getStorageProvider } from "@/server/storage";

// Assets are private per tenant. Membership is checked on every read — an
// asset id alone is never enough to fetch bytes (§33).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const asset = await db.asset.findUnique({ where: { id } });
  if (!asset) return new NextResponse("Not found", { status: 404 });

  const membership = await db.tenantUser.findFirst({
    where: { userId: user.id, tenantId: asset.tenantId },
  });
  // Same response for "doesn't exist" and "not yours" — no cross-tenant probing.
  if (!membership) return new NextResponse("Not found", { status: 404 });

  try {
    const data = await getStorageProvider().get(asset.storageKey);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(data.length),
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${encodeURIComponent(asset.filename)}"`,
      },
    });
  } catch {
    return new NextResponse("File unavailable", { status: 404 });
  }
}
