import { describe, it, expect } from "vitest";
import "./setup";
import { z } from "zod";
import {
  optionalPrice,
  optionalUrl,
  optionalEmail,
  optionalPhone,
  optionalText,
  firstError,
} from "@/lib/validation";

// ── Onboarding form handling ──────────────────────────────────────────────
// A browser sends "" for every empty input. These tests exist because that
// single fact broke onboarding: blank optional fields were rejected, and a
// blank price silently became ₹0.

describe("optional fields accept a blank input", () => {
  it("treats an empty string as 'not provided', not as a value", () => {
    expect(optionalText(80, "City").parse("")).toBeUndefined();
    expect(optionalPhone().parse("")).toBeUndefined();
    expect(optionalUrl().parse("")).toBeUndefined();
    expect(optionalEmail().parse("")).toBeUndefined();
    expect(optionalPrice().parse("")).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    expect(optionalText(80, "City").parse("  Chennai  ")).toBe("Chennai");
  });
});

describe("price", () => {
  it("never turns a blank price into zero", () => {
    // Regression: z.coerce.number() coerced "" to 0, which would have
    // advertised an unpriced product as free.
    expect(optionalPrice().parse("")).toBeUndefined();
    expect(optionalPrice().parse("   ")).toBeUndefined();
  });

  it("accepts what owners actually type", () => {
    expect(optionalPrice().parse("199")).toBe(199);
    expect(optionalPrice().parse("₹199")).toBe(199);
    expect(optionalPrice().parse("1,200")).toBe(1200);
    expect(optionalPrice().parse("1200.50")).toBe(1200.5);
  });

  it("rejects nonsense with a readable message", () => {
    const result = optionalPrice().safeParse("abc");
    expect(result.success).toBe(false);
    if (!result.success) expect(firstError(result.error)).toMatch(/number/i);
  });

  it("rejects a negative price", () => {
    expect(optionalPrice().safeParse("-50").success).toBe(false);
  });
});

describe("website", () => {
  it("accepts a bare domain and adds the scheme", () => {
    // Regression: "glowsalon.com" was rejected as "Invalid url".
    expect(optionalUrl().parse("glowsalon.com")).toBe("https://glowsalon.com");
    expect(optionalUrl().parse("www.glowsalon.com")).toBe("https://www.glowsalon.com");
  });

  it("leaves a full URL alone", () => {
    expect(optionalUrl().parse("https://glowsalon.com")).toBe("https://glowsalon.com");
    expect(optionalUrl().parse("http://glowsalon.com")).toBe("http://glowsalon.com");
  });

  it("still rejects something that isn't an address", () => {
    expect(optionalUrl().safeParse("not a website at all").success).toBe(false);
  });
});

describe("phone", () => {
  it("accepts real Indian formats, including two numbers", () => {
    expect(optionalPhone().parse("+91 98400 12345")).toBe("+91 98400 12345");
    expect(optionalPhone().parse("044-2345 6789")).toBe("044-2345 6789");
    // Regression: a 20-character cap rejected a shop listing two lines.
    expect(optionalPhone().parse("+91 98400 12345 / 98401 22222")).toBe(
      "+91 98400 12345 / 98401 22222",
    );
  });

  it("rejects letters", () => {
    expect(optionalPhone().safeParse("call us maybe").success).toBe(false);
  });
});

describe("email", () => {
  it("lowercases and accepts a valid address", () => {
    expect(optionalEmail().parse("Priya@Example.COM")).toBe("priya@example.com");
  });

  it("explains a typo in plain words", () => {
    const result = optionalEmail().safeParse("priya@");
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = firstError(result.error);
      expect(message).toMatch(/typo|doesn't look right/i);
      expect(message).not.toMatch(/^Invalid/);
    }
  });
});

describe("error messages", () => {
  it("never shows a raw zod string to a business owner", () => {
    const schema = z.object({ city: z.string().max(3) });
    const result = schema.safeParse({ city: "Chennai" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstError(result.error)).not.toMatch(/^String must contain/);
      // The field name is surfaced, capitalised for display.
      expect(firstError(result.error)).toMatch(/city/i);
    }
  });
});
