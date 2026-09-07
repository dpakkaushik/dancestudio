"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import {
  signInWithPasswordAction,
  type AuthActionState,
} from "@/features/auth/server-actions/auth";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { AuthBackLink } from "@/features/auth/components/AuthBackLink";
import { PasswordField } from "@/features/auth/components/PasswordField";
import { emailProblem, isEmailUsable } from "@/features/auth/types/email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = { error: null };

/** SIGN IN — "Sign in" from the welcome screen. Email + password, no email sent.
 *
 *  This is the prototype's sign-in screen (3727-3747) with the phone field
 *  swapped for a pair of credentials — the deliberate deviation logged with the
 *  sign-up screen. What is kept is the anatomy: the arrow, the 26px display
 *  heading, the sentence saying what the account is, tracked-out labels, the
 *  button that stays grey until the form can be sent.
 *
 *  NO MINIMUM LENGTH ON THIS FIELD. Rejecting a short password here would lock
 *  out any account created before the 8-character rule, the demo users
 *  included — length governs what you may CHOOSE, not what you may type to
 *  prove who you are (see types/password.ts). */
export function PasswordSignIn({ initialError = null }: { initialError?: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [state, formAction, isPending] = useActionState(signInWithPasswordAction, initialState);

  const fieldId = useId();
  const errorId = `${fieldId}-error`;

  const emailIssue = touched ? emailProblem(email) : null;
  const canSubmit = isEmailUsable(email) && password.length > 0;

  return (
    <AuthShell
      toast={state.error ?? initialError}
      footer={
        <p className="text-center text-[12.5px] text-muted-foreground">
          New to DanceOS?{" "}
          <Link
            href="/login/signup"
            data-slot="link"
            className="rounded-full font-extrabold text-primary underline-offset-4 hover:underline focus-visible:ring-[2.5px] focus-visible:ring-ring focus-visible:outline-none"
          >
            Create an account
          </Link>
        </p>
      }
    >
      <AuthBackLink href="/login" />

      <h1 className="mt-3.5 mb-1 font-display text-[26px] font-extrabold tracking-[-0.5px]">
        Welcome back
      </h1>
      <p className="mb-5 text-[13.5px] leading-[1.6] text-muted-foreground">
        Sign in with the email and password you set up.
      </p>

      <form action={formAction} noValidate>
        <div className="mb-3.5">
          <Label htmlFor={fieldId} className="mb-2 text-xs tracking-[0.5px]">
            Email address
          </Label>
          <Input
            id={fieldId}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            enterKeyHint="next"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={Boolean(emailIssue)}
            aria-describedby={emailIssue ? errorId : undefined}
            className="tracking-[0.2px]"
            autoFocus
          />
          {emailIssue ? (
            <p id={errorId} role="alert" className="mt-2 text-[12px] font-bold text-destructive">
              {emailIssue}
            </p>
          ) : null}
        </div>

        <PasswordField
          name="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        <p className="mb-3.5 text-right text-[12.5px]">
          <Link
            href="/login/forgot"
            data-slot="link"
            className="rounded-full font-extrabold text-primary underline-offset-4 hover:underline focus-visible:ring-[2.5px] focus-visible:ring-ring focus-visible:outline-none"
          >
            Forgot password?
          </Link>
        </p>

        <Button type="submit" disabled={!canSubmit || isPending} className="mt-1">
          {isPending ? "Signing you in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
