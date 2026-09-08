"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { resendEmailAction, type ResendState } from "@/features/auth/server-actions/auth";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { AuthBackLink } from "@/features/auth/components/AuthBackLink";

export type CheckEmailMode = "verify" | "reset";

/** The OTP screen's wait before "Resend OTP" is offered (prototype 3760). */
const RESEND_WAIT = 30;

const COPY: Record<
  CheckEmailMode,
  {
    heading: string;
    lead: string;
    back: string;
    retry: string;
    retryLabel: string;
    steps: Array<[title: string, detail: string]>;
  }
> = {
  verify: {
    heading: "Confirm your email",
    lead: "One tap on the link in it and your account is live.",
    back: "/login/signup",
    retry: "/login/signup",
    retryLabel: "Use a different email",
    steps: [
      ["Open the email from DanceOS", "Give it a minute. Not in the inbox? Look in spam or promotions."],
      [
        "Tap the link — on this device, in this browser",
        "It confirms the address and signs you in right here.",
      ],
      [
        "Set up your profile",
        "Your name, whether you are a dancer, a trainer or a studio, and your city. Then you are in.",
      ],
    ],
  },
  reset: {
    heading: "Check your inbox",
    lead: "One tap on the link in it and you can choose a new password.",
    back: "/login/forgot",
    retry: "/login/forgot",
    retryLabel: "Send it somewhere else",
    steps: [
      ["Open the email from DanceOS", "It lasts an hour. Not in the inbox? Look in spam."],
      [
        "Tap the link — on this device, in this browser",
        "It signs you in just long enough to set a new password.",
      ],
      ["Choose a new password", "Then you are back in, and the old one stops working."],
    ],
  },
};

const initialState: ResendState = { error: null, sentCount: 0 };

const pad = (n: number) => String(n).padStart(2, "0");

/** CHECK YOUR EMAIL — where both emails DanceOS sends leave a person waiting.
 *
 *  THE SCREEN IT TWINS is the prototype's OTP screen (3750-3762): the ←, the
 *  26px display heading, the sentence saying where the thing went, and under it
 *  the centred "Resend in 0:30" that becomes a pink "Resend OTP" when the wait
 *  is up. The code boxes that filled that screen have no email equivalent — the
 *  link does the typing — so their room is given to the two things a person
 *  waiting on an inbox actually needs: the ADDRESS, on its own so it can be
 *  checked against the inbox at a glance, and WHAT HAPPENS NEXT, because "tap
 *  the link" is not the end of the errand. The third step says so in words —
 *  your name, dancer / trainer / studio, your city — which is exactly where
 *  /auth/confirm lands a new account (app/auth/confirm/route.ts, `land`).
 *
 *  THE RESEND IS REAL. The old screen told people to wait "before asking for
 *  another" and offered no way to ask. This one counts down the OTP screen's
 *  thirty seconds and then offers the link, which calls Supabase's own resend
 *  (or another recovery email, on that errand) through resendEmailAction.
 *  Supabase's rate-limit refusal comes back as the toast, in its own words. */
export function CheckEmail({ email, mode }: { email: string; mode: CheckEmailMode }) {
  const copy = COPY[mode];
  const [state, formAction, isPending] = useActionState(resendEmailAction, initialState);

  /* The countdown. It restarts after every successful resend, which is a state
     reset in response to a prop-like change — done during render, the way React
     documents it, rather than in an effect that sets state. */
  const [left, setLeft] = useState(RESEND_WAIT);
  const [seenCount, setSeenCount] = useState(0);
  if (state.sentCount !== seenCount) {
    setSeenCount(state.sentCount);
    setLeft(RESEND_WAIT);
  }
  useEffect(() => {
    if (left <= 0) return;
    const tick = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(tick);
  }, [left]);

  return (
    <AuthShell
      toast={state.error}
      footer={
        <p className="text-center text-[12.5px]">
          <Link
            href={copy.retry}
            data-slot="link"
            className="rounded-full font-extrabold text-primary underline-offset-4 hover:underline focus-visible:ring-[2.5px] focus-visible:ring-ring focus-visible:outline-none"
          >
            {copy.retryLabel}
          </Link>
        </p>
      }
    >
      <AuthBackLink href={copy.back} />

      <h1 className="mt-3.5 mb-1 font-display text-[26px] font-extrabold tracking-[-0.5px]">
        {copy.heading}
      </h1>
      <p className="mb-4 text-[15px] leading-[1.6] text-muted-foreground">{copy.lead}</p>

      {/* the address, on its own — the one thing here a person checks against their inbox */}
      <div className="mb-6 flex items-center gap-3 rounded-[14px] border-[1.5px] border-border bg-card px-4 py-3.5">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
        >
          <Mail className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[9.5px] font-black tracking-[0.8px] opacity-65">SENT TO</p>
          <p className="mt-0.5 text-[14.5px] font-extrabold break-all text-foreground">{email}</p>
        </div>
      </div>

      <p className="mb-2.5 text-[9.5px] font-black tracking-[0.8px] opacity-65" aria-hidden>
        WHAT HAPPENS NEXT
      </p>
      <ol aria-label="What happens next" className="mb-5 flex flex-col gap-2.5">
        {copy.steps.map(([title, detail], i) => (
          <li
            key={title}
            className="flex gap-3.5 rounded-[14px] border-[1.5px] border-border bg-card px-3.5 py-3"
          >
            <span
              aria-hidden
              className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-primary text-[12.5px] font-extrabold text-primary"
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[14px] leading-[1.35] font-extrabold">{title}</p>
              <p className="mt-1 text-[12.5px] leading-[1.6] text-muted-foreground">{detail}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* the OTP screen's resend line (3760): a countdown, then the pink action */}
      <div role="status" aria-live="polite" className="text-center text-[13px] text-muted-foreground">
        {isPending ? (
          <b className="font-extrabold text-foreground">Sending…</b>
        ) : left > 0 ? (
          state.sentCount > 0 ? (
            <>
              <b className="font-extrabold" style={{ color: "var(--dos-success)" }}>
                ✓ Sent again
              </b>
              {" · "}another in{" "}
              <b className="font-extrabold text-foreground">0:{pad(left)}</b>
            </>
          ) : (
            <>
              Didn&apos;t get it? Resend in{" "}
              <b className="font-extrabold text-foreground">0:{pad(left)}</b>
            </>
          )
        ) : (
          <form action={formAction} className="inline">
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="mode" value={mode} />
            Didn&apos;t get it?{" "}
            <button
              type="submit"
              data-slot="link"
              className="rounded-full font-extrabold text-primary underline-offset-4 hover:underline focus-visible:ring-[2.5px] focus-visible:ring-ring focus-visible:outline-none"
            >
              Resend link
            </button>
          </form>
        )}
      </div>

      <div className="mt-4 rounded-[14px] border border-dashed border-border bg-white/[.06] px-[14px] py-3">
        <p className="text-[12px] leading-[1.7] text-muted-foreground">
          <b className="text-foreground">Nothing arriving?</b> Check spam and promotions
          first. While DanceOS is in development the mailer sends only a few messages an
          hour, so a resend can take a few minutes to land.
        </p>
      </div>
    </AuthShell>
  );
}
