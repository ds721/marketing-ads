import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { parseSignedRequest } from "@/server/social/instagram-oauth";
import { audit } from "@/server/audit";

export const dynamic = "force-dynamic";

/**
 * Meta calls this when an owner removes Markit from their Instagram settings.
 * We mark the connection disconnected so scheduled posts stop cleanly instead
 * of failing against a revoked token.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const payload = parseSignedRequest(String(form.get("signed_request") ?? ""));
  if (!payload) return new NextResponse("Bad signature", { status: 400 });

  const accounts = await db.socialAccount.findMany({
    where: { provider: "instagram", accountId: payload.user_id },
  });
  for (const account of accounts) {
    await db.socialAccount.update({ where: { id: account.id }, data: { status: "DISCONNECTED" } });
    await audit({
      tenantId: account.tenantId,
      action: "social.deauthorized_by_user",
      targetType: "social_account",
      targetId: account.id,
      meta: { provider: "instagram" },
    });
  }
  return NextResponse.json({ ok: true });
}
