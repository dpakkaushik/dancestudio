import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";

/** Lands every emailed link: verifies the token hash, then routes on WHAT KIND
 *  of link it was.
 *
 *  Two kinds exist since auth went email + password (7 Sep 2026):
 *
 *  - `signup` / `email` — confirming an address. The account already has the
 *    password its owner chose, so the only question left is whether onboarding
 *    ever finished: no profiles row means /onboarding, a row means Home.
 *  - `recovery` — a forgotten password. Redeeming this establishes a session but
 *    does NOT change the password, so sending this person to Home would leave
 *    them signed in and still locked out next time. They go to /login/reset,
 *    which is the only screen that can finish the job.
 *
 *  A bounce goes back to the screen that can retry the same thing: a failed
 *  recovery to /login/reset (whose action reports the expired session), anything
 *  else to sign-in. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const isRecovery = type === "recovery";

  if (tokenHash && type) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error && data.user) {
      if (isRecovery) {
        return NextResponse.redirect(new URL("/login/reset", request.url));
      }
      const profile = await findProfileById(supabase, data.user.id);
      return NextResponse.redirect(new URL(profile ? "/" : "/onboarding", request.url));
    }
  }

  /* Build the bounce with URLSearchParams rather than a hand-encoded string:
     a hand-written literal carried a raw em-dash and `+` separators, which is
     not what `?error=` means once anything reads it back. */
  const bounce = new URL(isRecovery ? "/login/reset" : "/login/email", request.url);
  bounce.searchParams.set(
    "error",
    isRecovery
      ? "That reset link is invalid or has expired — ask for a new one."
      : "That link is invalid or has expired — request a new one."
  );
  return NextResponse.redirect(bounce);
}
