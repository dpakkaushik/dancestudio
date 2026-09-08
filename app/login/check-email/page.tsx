import { redirect } from "next/navigation";
import { CheckEmail, type CheckEmailMode } from "@/features/auth/components/CheckEmail";
import { isEmailUsable } from "@/features/auth/types/email";

/** The email twin of the prototype's OTP screen (3750-3762). The link in the
 *  inbox does the work (app/auth/confirm/route.ts); this screen says where it
 *  went, what happens after it is tapped, and offers another when it does not
 *  arrive. The screen itself is CheckEmail — a client component, because the
 *  resend control counts down the way the OTP screen's "Resend in 0:30" does.
 *
 *  ONE SCREEN, TWO ERRANDS. Both emails DanceOS sends land a person here, and
 *  they are not the same errand — confirming a new address, or resetting a
 *  forgotten password. `mode` says which; an unknown or missing mode falls back
 *  to `verify`, the commoner of the two. */
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

  const which: CheckEmailMode = mode === "reset" ? "reset" : "verify";
  return <CheckEmail email={email} mode={which} />;
}
