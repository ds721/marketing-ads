import { z } from "zod";

// ── Form input helpers ────────────────────────────────────────────────────
// A browser sends "" for an empty input, never null or undefined. Optional
// fields must therefore treat "" as "not provided" — otherwise a blank box
// fails validation, or worse, coerces into a real value (a blank price
// becoming ₹0 and going out on a flyer as "free").

/** Trims, then turns "" into undefined so `.optional()` behaves as expected. */
export const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long (max ${max} characters).`)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

export const requiredText = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? `${label} is required.` : `${label} needs at least ${min} characters.`)
    .max(max, `${label} is too long (max ${max} characters).`);

/**
 * Money from a form. Blank means "no price" — never zero, because a product
 * priced at ₹0 would be advertised as free.
 */
export const optionalPrice = (label = "Price") =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[,₹\s]/g, ""))
    .refine((v) => v === "" || !Number.isNaN(Number(v)), `${label} should be a number, like 199.`)
    .refine((v) => v === "" || Number(v) >= 0, `${label} can't be negative.`)
    .refine((v) => v === "" || Number(v) <= 10_000_000, `${label} looks too large.`)
    .transform((v) => (v === "" ? undefined : Number(v)))
    .optional();

/**
 * Owners type "glowsalon.com", not "https://glowsalon.com". Accept what they
 * type and normalise it rather than rejecting it.
 */
export const optionalUrl = (label = "Website") =>
  z
    .string()
    .trim()
    .transform((v) => {
      if (v === "") return undefined;
      return /^https?:\/\//i.test(v) ? v : `https://${v}`;
    })
    .refine(
      (v) => v === undefined || z.string().url().safeParse(v).success,
      `${label} doesn't look like a web address. Try something like glowsalon.com`,
    )
    .optional();

export const optionalEmail = (label = "Email") =>
  z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? undefined : v))
    .optional()
    .refine(
      (v) => v === undefined || z.string().email().safeParse(v).success,
      `${label} doesn't look right. Check for a typo.`,
    );

/** Phone numbers vary a lot — two lines, country codes, extensions. */
export const optionalPhone = (label = "Phone number") =>
  z
    .string()
    .trim()
    .max(40, `${label} is too long.`)
    .refine(
      (v) => v === "" || /^[\d\s+()/,.-]{6,40}$/.test(v),
      `${label} should only contain digits and + ( ) - / spaces.`,
    )
    .transform((v) => (v === "" ? undefined : v))
    .optional();

/** First error, phrased for a shop owner — never a raw zod string. */
export function firstError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Please check the form and try again.";
  // Zod's built-in messages leak type jargon; ours always end with a full stop.
  const message = issue.message;
  if (/^(Invalid|Expected|String must|Required)/.test(message)) {
    const field = issue.path.join(" ") || "One of the fields";
    return `${field.charAt(0).toUpperCase()}${field.slice(1)} isn't valid. Please check it.`;
  }
  return message;
}
