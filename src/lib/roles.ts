import type { TenantRole } from "@prisma/client";

// Pure role logic, free of Next.js server imports so it can be unit-tested
// and used on either side of the boundary.

const ROLE_RANK: Record<TenantRole, number> = {
  VIEWER: 0,
  EDITOR: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function roleAtLeast(role: TenantRole, min: TenantRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}
