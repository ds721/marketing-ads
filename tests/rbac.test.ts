import { describe, it, expect } from "vitest";
import "./setup";
import { roleAtLeast } from "@/lib/roles";

// ── Role permissions (§34) ────────────────────────────────────────────────

describe("role hierarchy", () => {
  it("owner satisfies every requirement", () => {
    for (const min of ["VIEWER", "EDITOR", "ADMIN", "OWNER"] as const) {
      expect(roleAtLeast("OWNER", min)).toBe(true);
    }
  });

  it("viewer cannot edit, schedule or administer", () => {
    expect(roleAtLeast("VIEWER", "VIEWER")).toBe(true);
    expect(roleAtLeast("VIEWER", "EDITOR")).toBe(false);
    expect(roleAtLeast("VIEWER", "ADMIN")).toBe(false);
    expect(roleAtLeast("VIEWER", "OWNER")).toBe(false);
  });

  it("editor can create content but not change settings", () => {
    expect(roleAtLeast("EDITOR", "EDITOR")).toBe(true);
    expect(roleAtLeast("EDITOR", "ADMIN")).toBe(false);
  });

  it("admin can administer but is not the owner", () => {
    expect(roleAtLeast("ADMIN", "ADMIN")).toBe(true);
    expect(roleAtLeast("ADMIN", "OWNER")).toBe(false);
  });
});
