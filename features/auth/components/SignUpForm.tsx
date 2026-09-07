"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { signUpAction, type AuthActionState } from "@/features/auth/server-actions/auth";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { AuthBackLink } from "@/features/auth/components/AuthBackLink";
import { PasswordField } from "@/features/auth/components/PasswordField";
import { emailProblem, isEmailUsable } from "@/features/auth/types/email";
import { PASSWORD_MIN, isPasswordUsable, passwordProblem } from "@/features/auth/types/password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = { error: null };

/** SIGN UP — "Start dancing" from the welcome screen.
 *
 *  RULE 2 NOTE: the prototype has no sign-up screen and no password field
 *  anywhere — its one auth screen is "Sign in or join" with a phone number
 *  (3727-3747), because the prototype's model was passwordless. Splitting join
 *  from sign-in, and asking for a password, is a DELIBERATE DEVIATION at the
 *  user's instruction (7 Sep 2026) and is logged as one. What is kept is the
 *  prototype's anatomy: the ←, the 26px display heading, the sentence that says
 *  what the account IS, the tracked-out labels, the dashed explainer box, the
 *  button that stays grey until the form can be sent, and the legal line. */
export function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false, confirm: false });
  const [state, formAction, isPending] = useActionState(signUpAction, initialState);

  const fieldId = useId();
  const errorId = `${fieldId}-error`;

  /* Only nag once they have left a field — validating mid-typing marks "a@b"
     invalid while somebody is still typing "a@bc.com". */
  const emailIssue = touched.email ? emailProblem(email) : null;
  const passwordIssue = touched.password ? passwordProblem(password) : null;
  const confirmIssue =
    touched.confirm && confirm && confirm !== password ? "Those two passwords don't match" : null;

  const canSubmit = isEmailUsable(email) && isPasswordUsable(password) && confirm === password;

  return (
    <AuthShell
      toast={state.error}
      footer={
        <>
          <p className="text-center text-[12.5px] text-muted-foreground">
            Already dancing with us?{" "}
            <Link
              href="/login/email"
              data-slot="link"
              className="rounded-full font-extrabold text-primary underline-offset-4 hover:underline focus-visible:ring-[2.5px] focus-visible:ring-ring focus-visible:outline-none"
            >
              Sign in
            </Link>
          </p>
          <p className="mt-3 text-center text-[10.5px] leading-[1.6] text-muted-foreground">
            By continuing you agree to the <b className="text-foreground">Terms</b> &amp;{" "}
            <b className="text-foreground">Privacy Policy</b>.
          </p>
        </>
      }
    >
      <AuthBackLink href="/login" />

      <h1 className="mt-3.5 mb-1 font-display text-[26px] font-extrabold tracking-[-0.5px]">
        Create your account
      </h1>
      <p className="mb-5 text-[13.5px] leading-[1.6] text-muted-foreground">
        Your email is your account. Pick a password and we&apos;ll email you a link to
        confirm the address.
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
            onBlur={() => setTouched((was) => ({ ...was, email: true }))}
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
          onBlur={() => setTouched((was) => ({ ...was, password: true }))}
          problem={passwordIssue}
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN} characters.`}
        />

        <PasswordField
          name="confirm"
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          onBlur={() => setTouched((was) => ({ ...was, confirm: true }))}
          problem={confirmIssue}
          autoComplete="new-password"
        />

        <div className="my-3.5 rounded-[14px] border border-dashed border-border bg-white/[.06] px-[13px] py-2.5">
          <p className="text-[9.5px] font-black tracking-[0.8px] opacity-65">
            ONE MORE STEP AFTER THIS
          </p>
          <p className="mt-1 text-[12px] leading-[1.6] font-bold">
            We email a link to confirm it&apos;s your address. Tap it on this device and
            we&apos;ll set your profile up next.
          </p>
        </div>

        <Button type="submit" disabled={!canSubmit || isPending} className="mt-1">
          {isPending ? "Creating your account…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
