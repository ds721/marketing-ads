"use server";

import { hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { z } from "zod";
import { db } from "@/server/db";
import { getEmailProvider } from "@/server/email";
import { audit } from "@/server/audit";
import { signIn } from "@/server/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

export type FormState = { error?: string; ok?: boolean; message?: string };

const registerSchema = z.object({
  name: z.string().min(1, "Please tell us your name.").max(120),
  email: z.string().email("That doesn't look like an email address."),
  password: z.string().min(8, "Password needs at least 8 characters.").max(200),
});

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const { name, email, password } = parsed.data;
  const normalized = email.toLowerCase();

  const existing = await db.user.findUnique({ where: { email: normalized } });
  if (existing) return { error: "An account with this email already exists. Try logging in." };

  const passwordHash = await hash(password, 12);
  const user = await db.user.create({
    data: { name, email: normalized, passwordHash },
  });

  // Email verification (console driver prints the link in dev)
  const token = randomBytes(32).toString("base64url");
  await db.verificationToken.create({
    data: {
      identifier: normalized,
      token,
      purpose: "verify_email",
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24),
    },
  });
  const appUrl = process.env.APPLICATION_URL ?? "http://localhost:3000";
  await getEmailProvider().send({
    to: normalized,
    subject: "Verify your Markit email",
    text: `Welcome to Markit, ${name}!\n\nVerify your email: ${appUrl}/verify?token=${token}\n\nThe link expires in 24 hours.`,
  });

  await audit({ userId: user.id, action: "user.register" });

  // Sign the user straight in; verification is encouraged, not a wall.
  try {
    await signIn("credentials", { email: normalized, password, redirect: false });
  } catch {
    return { ok: true, message: "Account created. Please log in." };
  }
  redirect("/app");
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").toLowerCase();
  const password = String(formData.get("password") ?? "");
  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Email or password is incorrect." };
    }
    throw err;
  }
  redirect("/app");
}

export async function verifyEmailAction(token: string): Promise<FormState> {
  const record = await db.verificationToken.findUnique({ where: { token } });
  if (!record || record.purpose !== "verify_email" || record.expires < new Date()) {
    return { error: "This verification link is invalid or has expired." };
  }
  await db.user.update({
    where: { email: record.identifier },
    data: { emailVerified: new Date() },
  });
  await db.verificationToken.delete({ where: { token } });
  return { ok: true, message: "Email verified. You're all set." };
}

const resetRequestSchema = z.object({ email: z.string().email() });

export async function requestPasswordResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Enter the email you signed up with." };
  const email = parsed.data.email.toLowerCase();

  const user = await db.user.findUnique({ where: { email } });
  // Same response whether or not the account exists — no account enumeration.
  if (user) {
    const token = randomBytes(32).toString("base64url");
    await db.verificationToken.create({
      data: {
        identifier: email,
        token,
        purpose: "reset_password",
        expires: new Date(Date.now() + 1000 * 60 * 60),
      },
    });
    const appUrl = process.env.APPLICATION_URL ?? "http://localhost:3000";
    await getEmailProvider().send({
      to: email,
      subject: "Reset your Markit password",
      text: `Reset your password: ${appUrl}/reset-password?token=${token}\n\nThe link expires in 1 hour. If you didn't ask for this, ignore this email.`,
    });
  }
  return { ok: true, message: "If that account exists, a reset link is on its way." };
}

const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "Password needs at least 8 characters.").max(200),
});

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };

  const record = await db.verificationToken.findUnique({ where: { token: parsed.data.token } });
  if (!record || record.purpose !== "reset_password" || record.expires < new Date()) {
    return { error: "This reset link is invalid or has expired. Request a new one." };
  }
  const passwordHash = await hash(parsed.data.password, 12);
  const user = await db.user.update({
    where: { email: record.identifier },
    data: { passwordHash },
  });
  await db.verificationToken.delete({ where: { token: parsed.data.token } });
  await audit({ userId: user.id, action: "user.password_reset" });
  return { ok: true, message: "Password updated. You can log in now." };
}
