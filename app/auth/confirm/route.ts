import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";

/** Lands the email magic link: verifies the token hash, then routes the user to
 *  onboarding (no profile yet) or home — the same fork the OTP screen uses. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error && data.user) {
      const profile = await findProfileById(supabase, data.user.id);
      return NextResponse.redirect(new URL(profile ? "/" : "/onboarding", request.url));
    }
  }

  return NextResponse.redirect(
    new URL("/login/phone?error=That+sign-in+link+is+invalid+or+expired+—+request+a+new+one", request.url)
  );
}
