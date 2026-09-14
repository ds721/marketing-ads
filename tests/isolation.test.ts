import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "./setup";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

// ── Tenant isolation (§48) ────────────────────────────────────────────────
// The rule under test: every tenant-owned read is filtered by a tenantId that
// came from a verified membership, so knowing another tenant's record id is
// never enough to reach it.

const db = new PrismaClient();

let tenantA: string;
let tenantB: string;
let userA: string;
let userB: string;
let contentB: string;
let assetB: string;

beforeAll(async () => {
  const pw = await hash("password123", 4);
  const [a, b] = await Promise.all([
    db.user.create({ data: { email: `a-${Date.now()}@test.dev`, passwordHash: pw } }),
    db.user.create({ data: { email: `b-${Date.now()}@test.dev`, passwordHash: pw } }),
  ]);
  userA = a.id;
  userB = b.id;

  const ta = await db.tenant.create({
    data: { slug: `iso-a-${Date.now()}`, name: "Tenant A", members: { create: { userId: userA, role: "OWNER" } } },
  });
  const tb = await db.tenant.create({
    data: { slug: `iso-b-${Date.now()}`, name: "Tenant B", members: { create: { userId: userB, role: "OWNER" } } },
  });
  tenantA = ta.id;
  tenantB = tb.id;

  const item = await db.contentItem.create({
    data: { tenantId: tenantB, platform: "instagram", title: "B's secret post", body: "confidential" },
  });
  contentB = item.id;

  const asset = await db.asset.create({
    data: {
      tenantId: tenantB,
      filename: "b-private.png",
      mimeType: "image/png",
      sizeBytes: 100,
      storageKey: `${tenantB}/private-${Date.now()}.png`,
    },
  });
  assetB = asset.id;
});

afterAll(async () => {
  await db.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
  await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
  await db.$disconnect();
});

describe("tenant isolation", () => {
  it("a user has no membership in another user's tenant", async () => {
    const membership = await db.tenantUser.findFirst({ where: { userId: userA, tenantId: tenantB } });
    expect(membership).toBeNull();
  });

  it("content scoped by tenantId is unreachable across tenants, even with the exact id", async () => {
    const asOwner = await db.contentItem.findFirst({ where: { id: contentB, tenantId: tenantB } });
    expect(asOwner).not.toBeNull();

    // This is the shape every server action uses: id AND tenantId.
    const asIntruder = await db.contentItem.findFirst({ where: { id: contentB, tenantId: tenantA } });
    expect(asIntruder).toBeNull();
  });

  it("assets are unreachable across tenants", async () => {
    const asIntruder = await db.asset.findFirst({ where: { id: assetB, tenantId: tenantA } });
    expect(asIntruder).toBeNull();
  });

  it("listing a tenant's content never returns another tenant's rows", async () => {
    const rows = await db.contentItem.findMany({ where: { tenantId: tenantA } });
    expect(rows.every((r) => r.tenantId === tenantA)).toBe(true);
    expect(rows.find((r) => r.id === contentB)).toBeUndefined();
  });

  it("deleting a tenant cascades its data and leaves the other tenant intact", async () => {
    const throwaway = await db.tenant.create({
      data: { slug: `iso-c-${Date.now()}`, name: "Tenant C" },
    });
    await db.contentItem.create({
      data: { tenantId: throwaway.id, platform: "facebook", title: "temp", body: "temp" },
    });
    await db.tenant.delete({ where: { id: throwaway.id } });

    expect(await db.contentItem.count({ where: { tenantId: throwaway.id } })).toBe(0);
    expect(await db.contentItem.count({ where: { tenantId: tenantB } })).toBeGreaterThan(0);
  });
});
