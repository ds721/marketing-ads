import { describe, it, expect, afterAll } from "vitest";
import "./setup";
import { PrismaClient } from "@prisma/client";
import { isReservedSlug, RESERVED_SLUGS } from "@/lib/reserved-slugs";
import { slugify } from "@/lib/utils";
import { readdirSync, statSync } from "fs";
import { join } from "path";

// ── Root-path business pages ──────────────────────────────────────────────
// Business pages live at markit.app/{slug}. The danger of that choice is
// collision: a business slug that matches a platform route would shadow it.

const db = new PrismaClient();

describe("reserved slugs", () => {
  it("blocks every platform route a business could otherwise shadow", () => {
    for (const path of ["login", "register", "app", "admin", "api", "onboarding", "verify"]) {
      expect(isReservedSlug(path)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(isReservedSlug("Login")).toBe(true);
    expect(isReservedSlug("ADMIN")).toBe(true);
  });

  it("leaves normal business names alone", () => {
    for (const name of ["glow-salon", "spice-house", "raos-bakery", "fitzone-gym"]) {
      expect(isReservedSlug(name)).toBe(false);
    }
  });

  /**
   * The guard rail that matters: every top-level directory under src/app is a
   * real route, so each one must be reserved. This test fails the moment
   * someone adds a route without reserving its name.
   */
  it("covers every top-level route that exists in the app", () => {
    const appDir = join(process.cwd(), "src", "app");
    const routes = readdirSync(appDir)
      .filter((entry) => statSync(join(appDir, entry)).isDirectory())
      // Dynamic segments ([slug]) and groups ((auth)) aren't literal paths.
      .filter((entry) => !entry.startsWith("[") && !entry.startsWith("("));

    const unreserved = routes.filter((route) => !RESERVED_SLUGS.has(route));
    expect(unreserved, `these routes are not in RESERVED_SLUGS: ${unreserved.join(", ")}`).toEqual([]);
  });
});

describe("slug generation", () => {
  it("turns a business name into a clean URL segment", () => {
    expect(slugify("Glow Salon")).toBe("glow-salon");
    // Accents fold to their base letter rather than being dropped.
    expect(slugify("Rao's Bakery & Café")).toBe("rao-s-bakery-cafe");
    expect(slugify("Café Niloufer")).toBe("cafe-niloufer");
    expect(slugify("  Spice   House  ")).toBe("spice-house");
  });

  it("never produces an empty slug", () => {
    expect(slugify("!!!").length).toBeGreaterThan(0);
    expect(slugify("")).toBe("business");
  });
});

describe("tenant slugs already in the database", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("none of them shadow a platform route", async () => {
    const tenants = await db.tenant.findMany({ select: { slug: true } });
    const offenders = tenants.map((t) => t.slug).filter(isReservedSlug);
    expect(offenders, `these tenant slugs collide with routes: ${offenders.join(", ")}`).toEqual([]);
  });

  it("slugs are unique", async () => {
    const tenants = await db.tenant.findMany({ select: { slug: true } });
    expect(new Set(tenants.map((t) => t.slug)).size).toBe(tenants.length);
  });
});
