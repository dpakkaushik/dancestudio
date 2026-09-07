"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import {
  requestPasswordResetAction,
  type AuthActionState,
} from "@/features/auth/server-actions/auth";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { AuthBackLink } from "@/features/auth/components/AuthBackLink";
import { emailProblem, isEmailUsable } from "@/features/auth/types/email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = { error: null };

/** FORGOT PASSWORD — the emailed link, which is all the old passwordless screen
 *  is now. It sends a RECOVERY link, not a sign-in link, so redeeming it lands
 *  on /login/reset to choose a new password rather than dropping the person into
 *  the app still not knowing it. */
export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [state, formAction, isPending] = useActionState(requestPasswordResetAction, initialState);

  const fieldId = useId();
  const errorId = `${fieldId}-error`;

  const problem = touched ? emailProblem(email) : null;
  const valid = isEmailUsable(email);

  return (
    <AuthShell
      toast={state.error}
      footer={
        <p className="text-center text-[12.5px] text-muted-foreground">
          Remembered it?{" "}
          <Link
            href="/login/email"
            data-slot="link"
            className="rounded-full font-extrabold text-primary underline-offset-4 hover:underline focus-visible:ring-[2.5px] focus-visible:ring-ring focus-visible:outline-none"
          >
            Back to sign in
          </Link>
        </p>
      }
    >
      <AuthBackLink href="/login/email" />

      <h1 className="mt-3.5 mb-1 font-display text-[26px] font-extrabold tracking-[-0.5px]">
        Forgot password
      </h1>
      <p className="mb-5 text-[13.5px] leading-[1.6] text-muted-foreground">
        Tell us the address on your account and we will email a link to set a new
        password.
      </p>

      <form action={formAction} noValidate>
        <Label htmlFor={fieldId} className="mb-2 text-xs tracking-[0.5px]">
          Email address
        </Label>
        <Input
          id={fieldId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          enterKeyHint="send"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={Boolean(problem)}
          aria-describedby={problem ? errorId : undefined}
          className="tracking-[0.2px]"
          autoFocus
        />
        {problem ? (
          <p id={errorId} role="alert" className="mt-2 text-[12px] font-bold text-destructive">
            {problem}
          </p>
        ) : null}

        <div className="my-3.5 rounded-[14px] border border-dashed border-border bg-white/[.06] px-[13px] py-2.5">
          <p className="text-[9.5px] font-black tracking-[0.8px] opacity-65">
            THE LINK LASTS AN HOUR
          </p>
          <p className="mt-1 text-[12px] leading-[1.6] font-bold">
            Open it on this device. Asking for another replaces the one before it.
          </p>
        </div>

        <Button type="submit" disabled={!valid || isPending} className="mt-1">
          {isPending ? "Sending…" : "Email me a reset link"}
        </Button>
      </form>
    </AuthShell>
  );
}
