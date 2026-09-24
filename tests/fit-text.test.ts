import { describe, it, expect, beforeAll } from "vitest";
import { ensureFonts, measure } from "@/server/creative/fonts";
import { fitLabel, fitSize } from "@/server/creative/svg";

// A long timing line ("Every Tuesday & Wednesday, 1 October – 31 October") used
// to run off the canvas and over the call to action. Every template now sizes
// this text to a width budget, so the budget maths has to hold.

const LONG = "EVERY TUESDAY & WEDNESDAY, 1 OCTOBER – 31 OCTOBER";

beforeAll(async () => {
  await ensureFonts();
});

describe("fitting text to a width budget", () => {
  it("shrinks a long line until it fits", () => {
    const max = 900;
    const size = fitSize("body", LONG, 32, max);
    expect(measure("body", LONG, size)).toBeLessThanOrEqual(max);
  });

  it("counts letter spacing, which is what broke the framed look", () => {
    const max = 900;
    const tracking = 13; // ~0.012em on a 1080px canvas
    const naive = fitSize("body", LONG, 30, max); // ignores tracking
    expect(measure("body", LONG, naive, tracking)).toBeGreaterThan(max);

    const fit = fitLabel("body", LONG, 30, max, 0.5, tracking);
    expect(measure("body", LONG, fit.size, fit.letterSpacing)).toBeLessThanOrEqual(max);
  });

  it("scales the tracking down with the type", () => {
    const fit = fitLabel("body", LONG, 30, 600, 0.5, 13);
    expect(fit.size).toBeLessThan(30);
    expect(fit.letterSpacing).toBeLessThan(13);
    expect(fit.letterSpacing).toBeGreaterThan(0);
  });

  it("leaves a short line at full size", () => {
    expect(fitSize("body", "Sunday", 32, 900)).toBe(32);
  });

  it("never shrinks past the floor, however long the text", () => {
    const size = fitSize("body", LONG.repeat(6), 32, 200, 0.6);
    expect(size).toBeGreaterThanOrEqual(Math.round(32 * 0.6));
  });

  it("is a no-op when there is no budget to fit to", () => {
    expect(fitSize("body", LONG, 32, 0)).toBe(32);
  });
});
