"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  loginAction,
  registerAction,
  requestPasswordResetAction,
  resetPasswordAction,
  type FormState,
} from "@/server/actions/auth";
import { Field, FormError, FormSuccess, inputCls, btnStyles } from "@/components/ui";

const initial: FormState = {};

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError error={state.error} />
      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required className={inputCls} />
      </Field>
      <Field label="Password" htmlFor="password">
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputCls} />
      </Field>
      <button type="submit" disabled={pending} className={btnStyles.primary}>
        {pending ? "Logging in…" : "Log in"}
      </button>
      {googleEnabled ? (
        <a href="/api/auth/signin/google" className={btnStyles.secondary}>
          Continue with Google
        </a>
      ) : null}
      <div className="flex justify-between text-sm text-ink-soft">
        <Link className="hover:text-ink" href="/forgot-password">
          Forgot password?
        </Link>
        <Link className="hover:text-ink" href="/register">
          Create an account
        </Link>
      </div>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError error={state.error} />
      <FormSuccess message={state.message} />
      <Field label="Your name" htmlFor="name">
        <input id="name" name="name" autoComplete="name" required className={inputCls} />
      </Field>
      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required className={inputCls} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className={inputCls} />
      </Field>
      <button type="submit" disabled={pending} className={btnStyles.primary}>
        {pending ? "Creating your account…" : "Create account"}
      </button>
      <p className="text-sm text-ink-soft text-center">
        Already have an account?{" "}
        <Link className="font-semibold text-ink hover:text-beet" href="/login">
          Log in
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError error={state.error} />
      <FormSuccess message={state.message} />
      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" required className={inputCls} />
      </Field>
      <button type="submit" disabled={pending} className={btnStyles.primary}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError error={state.error} />
      <FormSuccess message={state.message} />
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className={inputCls} />
      </Field>
      <button type="submit" disabled={pending} className={btnStyles.primary}>
        {pending ? "Updating…" : "Update password"}
      </button>
      {state.ok ? (
        <Link href="/login" className={btnStyles.secondary}>
          Go to login
        </Link>
      ) : null}
    </form>
  );
}
