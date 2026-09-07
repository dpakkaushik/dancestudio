import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { AuthBackLink } from "@/features/auth/components/AuthBackLink";
import { isEmailUsable } from "@/features/auth/types/email";

/** The email twin of the prototype's OTP screen (3750-3762): same shell, same
 *  arrow, same 26px display heading, same sentence saying where the thing went.
 *  The link in the inbox does the work (app/auth/confirm/route.ts); this screen
 *  only says where it went and what to do if it does not arrive.
 *
 *  ONE SCREEN, TWO ERRANDS. Both emails DanceOS sends land a person here, and
 *  they are not the same errand — confirming a new address, or resetting a
 *  forgotten password. `mode` says which, so the heading, the sentence and the
 *  back arrow all point at the flow the person is actually in. An unknown or
 *  missing mode falls back to `verify`, the commoner of the two. */
type Mode = "verify" | "reset";

const COPY: Record<Mode, { heading: string; back: string; retry: string; retryLabel: string }> = {
  verify: {
    heading: "Confirm your email",
    back: "/login/signup",
    retry: "/login/signup",
    retryLabel: "Use a different email",
  },
  reset: {
    heading: "Check your inbox",
    back: "/login/forgot",
    retry: "/login/forgot",
    retryLabel: "Send it somewhere else",
  },
};

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; mode?: string }>;
}) {
  const { email, mode } = await searchParams;

  /* The same schema the forms and the actions use, rather than a looser
     `includes("@")` — a value this screen would accept but an action would not
     could only have arrived by hand-editing the URL. */
  if (!email || !isEmailUsable(email)) {
    redirect("/login/email");
  }

  const which: Mode = mode === "reset" ? "reset" : "verify";
  const copy = COPY[which];

  return (
    <AuthShell
      toast={null}
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
      <p className="mb-5 text-[13.5px] leading-[1.6] text-muted-foreground">
        {which === "reset" ? (
          <>
            We emailed a link to{" "}
            <b className="font-bold break-all text-foreground">{email}</b>. Tap it on this
            device to set a new password.
          </>
        ) : (
          <>
            We emailed a link to{" "}
            <b className="font-bold break-all text-foreground">{email}</b>. Tap it on this
            device to confirm the address, and we will set your profile up next.
          </>
        )}
      </p>

      <div className="rounded-[14px] border border-dashed border-border bg-white/[.06] px-[14px] py-3">
        <p className="text-[11.5px] leading-[1.7] text-muted-foreground">
          <b className="text-foreground">Nothing arriving?</b> Check spam first. While
          DanceOS is in development the mailer is rate-limited to a handful of messages
          an hour, so give it a few minutes before asking for another.
        </p>
      </div>
    </AuthShell>
  );
}
