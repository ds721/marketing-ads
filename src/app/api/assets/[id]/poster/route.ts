import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/tenant";
import { getStorageProvider } from "@/server/storage";

// Video poster frames, under the same tenant membership check as the asset itself.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const asset = await db.asset.findUnique({ where: { id } });
  if (!asset?.posterKey) return new NextResponse("Not found", { status: 404 });

  const membership = await db.tenantUser.findFirst({
    where: { userId: user.id, tenantId: asset.tenantId },
  });
  if (!membership) return new NextResponse("Not found", { status: 404 });

  try {
    const data = await getStorageProvider().get(asset.posterKey);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
