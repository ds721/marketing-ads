import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import type { Tenant, TenantRole, TenantUser } from "@prisma/client";
import { roleAtLeast } from "@/lib/roles";

// ─── Tenant isolation core ────────────────────────────────────────────────
// Every server action / page that touches tenant data goes through
// requireTenant(slug, minRole). The tenantId used in queries comes ONLY
// from the membership row loaded here — never from client input.

export { roleAtLeast } from "@/lib/roles";

export class TenantAccessError extends Error {
  constructor(message = "You don't have access to this business.") {
    super(message);
    this.name = "TenantAccessError";
  }
}

export const getSessionUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user as { id: string; email?: string | null; name?: string | null };
});

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export interface TenantContext {
  tenant: Tenant;
  membership: TenantUser;
  userId: string;
  role: TenantRole;
}

const loadMembership = cache(async (userId: string, slug: string) => {
  return db.tenantUser.findFirst({
    where: { userId, tenant: { slug } },
    include: { tenant: true },
  });
});

/**
 * Resolve the current user's membership in the tenant addressed by `slug`.
 * Redirects to login when unauthenticated; throws TenantAccessError when the
 * user is not a member, the tenant is suspended, or the role is insufficient.
 */
export async function requireTenant(slug: string, minRole: TenantRole = "VIEWER"): Promise<TenantContext> {
  const user = await requireUser();
  const membership = await loadMembership(user.id, slug);
  if (!membership) throw new TenantAccessError();
  if (membership.tenant.status === "SUSPENDED") {
    throw new TenantAccessError("This business is suspended. Contact support.");
  }
  if (!roleAtLeast(membership.role, minRole)) {
    throw new TenantAccessError("Your role doesn't allow this action.");
  }
  const { tenant, ...m } = membership;
  return { tenant, membership: m as TenantUser, userId: user.id, role: membership.role };
}

/**
 * Guard for entity ownership: call after loading any record by id from a
 * client-supplied identifier, before acting on it.
 */
export function assertTenantOwns(ctx: { tenant: { id: string } }, entity: { tenantId: string } | null): asserts entity {
  if (!entity || entity.tenantId !== ctx.tenant.id) {
    throw new TenantAccessError("Not found.");
  }
}

/** Platform-level admin (not a tenant role). */
export async function requirePlatformAdmin() {
  const user = await requireUser();
  const record = await db.user.findUnique({ where: { id: user.id } });
  if (!record?.isPlatformAdmin) redirect("/app");
  return record;
}

export async function listUserTenants(userId: string) {
  return db.tenantUser.findMany({
    where: { userId },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });
}
