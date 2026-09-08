import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";

/** Lands every emailed link, in EITHER of the two shapes Supabase can send.
 *
 *  THE BUG THIS EXISTS TO PREVENT (7 Sep 2026). This route originally read only
 *  `token_hash`, which arrives only if the project's email template has been
 *  customised to `{{ .TokenHash }}`. The hosted project was never customised —
 *  it still sends the stock `{{ .ConfirmationURL }}`:
 *
 *    {SUPABASE_URL}/auth/v1/verify?token=pkce_…&type=signup
 *      &redirect_to={origin}/auth/confirm
 *
 *  Supabase's own /verify confirms the address, then redirects here with a
 *  `code` — never a `token_hash`. So the guard was always false, every link
 *  fell through to the bounce, and EVERY email path was dead: nobody could
 *  finish a signup and nobody could reset a password. The account was left
 *  confirmed but sessionless, so the person saw "that link expired" and then
 *  "Invalid login credentials", neither of which names the real problem.
 *
 *  Both shapes are handled rather than just the one in use, because the
 *  template is a dashboard setting outside this repo: someone customising it
 *  later must not break auth again, and someone resetting it must not either.
 *
 *  WHY `flow` AND NOT JUST `type`. The token_hash shape carries `type=recovery`;
 *  the PKCE shape carries no type at all, so a recovery link is indistinguishable
 *  from a confirmation link by the time it gets here. Sending a recovery to Home
 *  would leave the person signed in and still unable to remember their password,
 *  so the sender stamps `?flow=recovery` onto its own redirect URL — Supabase
 *  preserves the query it was given and appends to it. Either signal counts. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  /* Supabase reports its own refusals this way (expired link, already used). */
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");

  const isRecovery = type === "recovery" || searchParams.get("flow") === "recovery";

  if (!providerError) {
    const supabase = await createSupabaseServerClient();

    /* Shape 1 — a customised {{ .TokenHash }} template. Preferred when it is
       configured: it needs nothing from the browser, so it survives the link
       being opened in a different app from the one that asked for it. */
    if (tokenHash && type) {
      const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error && data.user) {
        return land(request, supabase, data.user.id, isRecovery);
      }
    }

    /* Shape 2 — the stock template's PKCE code, which is what actually arrives
       today. The exchange needs the code_verifier cookie set when the link was
       requested, so this only completes in the browser that started the flow;
       `land` is unreachable otherwise.

       WHAT IS TRUE WHEN THE EXCHANGE FAILS (8 Sep 2026, seen by the user). A
       `code` is minted by Supabase's /verify AFTER it has confirmed the
       address, so a confirmation code that cannot be exchanged here still
       leaves a CONFIRMED account with the password its owner chose — the only
       thing missing is this browser's session. The right next step is to sign
       in, and the bounce lands on the sign-in screen saying exactly that.
       "Ask for a new one" would be wrong advice: `auth.resend` for an already
       confirmed address sends nothing, on purpose. A RECOVERY code is different
       — the person cannot sign in with a password they have forgotten — so
       that errand keeps the same-browser explanation and the offer of another. */
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.user) {
        return land(request, supabase, data.user.id, isRecovery);
      }
      if (error) {
        return bounce(
          request,
          isRecovery,
          isRecovery
            ? "That reset link could not be opened here — open it in the same browser you asked for it from, or ask for a new one."
            : "Your email is confirmed — sign in with your password and we will set your profile up next."
        );
      }
    }
  }

  return bounce(
    request,
    isRecovery,
    providerError ??
      (isRecovery
        ? "That reset link is invalid or has expired — ask for a new one."
        : "That link is invalid or has expired — request a new one.")
  );
}

/** Where a redeemed link goes: recovery to the only screen that can finish the
 *  job, anything else to onboarding or Home depending on whether it finished. */
async function land(
  request: NextRequest,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  isRecovery: boolean
) {
  if (isRecovery) {
    return NextResponse.redirect(new URL("/login/reset", request.url));
  }
  const profile = await findProfileById(supabase, userId);
  return NextResponse.redirect(new URL(profile ? "/" : "/onboarding", request.url));
}

/** Back to the screen that can retry the same thing, carrying a message that
 *  says what to do. Built with URLSearchParams rather than a hand-encoded
 *  string: a literal carried a raw em-dash and `+` separators, which is not
 *  what `?error=` means once anything reads it back. */
function bounce(request: NextRequest, isRecovery: boolean, message: string) {
  const url = new URL(isRecovery ? "/login/reset" : "/login/email", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}
