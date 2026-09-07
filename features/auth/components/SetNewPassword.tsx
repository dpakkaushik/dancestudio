"use client";

import { useActionState, useState } from "react";
import {
  setNewPasswordAction,
  type AuthActionState,
} from "@/features/auth/server-actions/auth";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { PasswordField } from "@/features/auth/components/PasswordField";
import { PASSWORD_MIN, isPasswordUsable, passwordProblem } from "@/features/auth/types/password";
import { Button } from "@/components/ui/button";

const initialState: AuthActionState = { error: null };

/** SET A NEW PASSWORD — where a recovery link lands (/auth/confirm routes
 *  `type=recovery` here once the token is redeemed).
 *
 *  NO BACK ARROW ON THIS SCREEN, deliberately: the session that makes this form
 *  work was created by the link, and there is nowhere useful to go back to.
 *  Leaving without setting a password would leave the person signed in but still
 *  not knowing it, so the only way out is forwards.
 *
 *  No email field either — the session says whose password this is, and the
 *  action re-checks that server-side rather than trusting this form's existence. */
export function SetNewPassword({ initialError = null }: { initialError?: string | null }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState({ password: false, confirm: false });
  const [state, formAction, isPending] = useActionState(setNewPasswordAction, initialState);

  const passwordIssue = touched.password ? passwordProblem(password) : null;
  const confirmIssue =
    touched.confirm && confirm && confirm !== password
      ? "Those two passwords do not match"
      : null;
  const canSubmit = isPasswordUsable(password) && confirm === password;

  return (
    <AuthShell
      toast={state.error ?? initialError}
      footer={
        <p className="text-center text-[11.5px] leading-[1.6] text-muted-foreground">
          The link that brought you here works once. Setting a password signs you in
          on this device and leaves any other session alone.
        </p>
      }
    >
      <h1 className="mt-3.5 mb-1 font-display text-[26px] font-extrabold tracking-[-0.5px]">
        Set a new password
      </h1>
      <p className="mb-5 text-[13.5px] leading-[1.6] text-muted-foreground">
        Choose something you will remember. You will be signed in straight after.
      </p>

      <form action={formAction} noValidate>
        <PasswordField
          name="password"
          label="New password"
          value={password}
          onChange={setPassword}
          onBlur={() => setTouched((was) => ({ ...was, password: true }))}
          problem={passwordIssue}
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN} characters.`}
          autoFocus
        />

        <PasswordField
          name="confirm"
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          onBlur={() => setTouched((was) => ({ ...was, confirm: true }))}
          problem={confirmIssue}
          autoComplete="new-password"
        />

        <Button type="submit" disabled={!canSubmit || isPending} className="mt-1">
          {isPending ? "Saving…" : "Save and sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
