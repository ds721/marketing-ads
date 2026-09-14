import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/server/db";
import { parseSignedRequest } from "@/server/social/instagram-oauth";
import { audit } from "@/server/audit";

export const dynamic = "force-dynamic";

/**
 * Meta's data-deletion callback: the user asked Instagram to delete the data
 * an app holds about them. We remove every stored connection for that
 * Instagram user and return a confirmation code Meta can show them.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const payload = parseSignedRequest(String(form.get("signed_request") ?? ""));
  if (!payload) return new NextResponse("Bad signature", { status: 400 });

  const accounts = await db.socialAccount.findMany({
    where: { provider: "instagram", accountId: payload.user_id },
    select: { id: true, tenantId: true },
  });
  await db.socialAccount.deleteMany({
    where: { provider: "instagram", accountId: payload.user_id },
  });
  for (const account of accounts) {
    await audit({
      tenantId: account.tenantId,
      action: "social.data_deleted_by_user",
      targetType: "social_account",
      targetId: account.id,
      meta: { provider: "instagram" },
    });
  }

  const code = randomBytes(8).toString("hex");
  const base = (process.env.APPLICATION_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return NextResponse.json({
    url: `${base}/deletion-status?code=${code}`,
    confirmation_code: code,
  });
}
