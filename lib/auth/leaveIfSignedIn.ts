import { RedirectType, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** ⚠ A SIGNED-IN PERSON NEVER SEES A SIGN-IN SCREEN (3 Oct 2026, the user:
 *  "backswipe is logging out sometimes which should not happen"). Nothing was
 *  signing anybody out: a back swipe past Home landed on the welcome screen or
 *  the sign-in form, which drew themselves whatever the session said — and a
 *  sign-in screen reads as "you have been logged out". Each of those pages asks
 *  first and sends a live session home, REPLACING the entry so the next back
 *  swipe leaves the app rather than looping.
 *  ⚠ `/login/reset` does NOT call this: a recovery link signs somebody in so they
 *  can set a password there, and bouncing them to Home would lock them out. */
export async function leaveIfSignedIn(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect("/", RedirectType.replace);
  }
}
