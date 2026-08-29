"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { OTP_VERIFY_TYPE, otpChannelPlan, type OtpChannel } from "@/lib/auth/otpChannel";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ONBOARDING_COOKIE } from "@/lib/auth/onboarding";
import { createProfile, findProfileById } from "@/repositories/profiles";

export interface AuthActionState {
  error: string | null;
  phone?: string;
}

/** Indian mobile: 10 digits starting 6-9. Stored/verified as +91XXXXXXXXXX. */
const phoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number");

const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "The code is 6 digits");

const completeProfileSchema = z.object({
  fullName: z.string().trim().min(1, "Tell us your name").max(120),
  role: z.enum(["dancer", "trainer", "studio"]),
  city: z.string().trim().max(120).optional(),
});

const toE164 = (tenDigits: string): string => `+91${tenDigits}`;

export async function requestOtpAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = phoneSchema.safeParse(formData.get("phone"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid number" };
  }

  /* Step 26: WhatsApp-first when it is switched on, SMS otherwise — and if a
     WhatsApp send is refused (no approved template yet, the number is not on
     WhatsApp) the fallback carries it by SMS. Whichever one actually sent is
     what the next screen says; a message that went by SMS is never described as
     WhatsApp. */
  const supabase = await createSupabaseServerClient();
  const plan = otpChannelPlan();
  let sentOn: OtpChannel | null = null;
  let lastError = "";
  for (const channel of plan) {
    const { error } = await supabase.auth.signInWithOtp({
      phone: toE164(parsed.data),
      options: { channel },
    });
    if (!error) {
      sentOn = channel;
      break;
    }
    lastError = error.message;
  }
  if (!sentOn) {
    return { error: lastError || "Could not send the code" };
  }

  redirect(`/login/verify?phone=${parsed.data}&via=${sentOn}`);
}

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

/** Interim real sign-in (24 Aug 2026): Supabase email magic link — works on the
 *  current plan with no SMS/SMTP provider. WhatsApp OTP stays the production
 *  phone channel, wired at Step 6. */
export async function requestEmailLinkAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid email" };
  }

  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) {
    return { error: error.message };
  }

  redirect(`/login/check-email?email=${encodeURIComponent(parsed.data)}`);
}

export async function verifyOtpAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const phoneParsed = phoneSchema.safeParse(formData.get("phone"));
  const otpParsed = otpSchema.safeParse(formData.get("token"));
  if (!phoneParsed.success) {
    return { error: "Missing mobile number — start again from the login page" };
  }
  if (!otpParsed.success) {
    return {
      error: otpParsed.error.issues[0]?.message ?? "Invalid code",
      phone: phoneParsed.data,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    phone: toE164(phoneParsed.data),
    token: otpParsed.data,
    /* the channel is a delivery choice, not a different kind of token */
    type: OTP_VERIFY_TYPE,
  });
  if (error || !data.user) {
    return {
      error: error?.message ?? "Could not verify the code",
      phone: phoneParsed.data,
    };
  }

  const profile = await findProfileById(supabase, data.user.id);
  redirect(profile ? "/" : "/onboarding");
}

export async function completeProfileAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = completeProfileSchema.safeParse({
    fullName: formData.get("fullName"),
    role: formData.get("role"),
    city: (formData.get("city") as string) || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const existing = await findProfileById(supabase, user.id);
  if (!existing) {
    try {
      await createProfile(supabase, {
        id: user.id,
        fullName: parsed.data.fullName,
        role: parsed.data.role,
        city: parsed.data.city ?? null,
      });
    } catch (error: unknown) {
      return {
        error:
          error instanceof Error ? error.message : "Could not save your profile",
      };
    }
  }

  redirect("/");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** ONBOARDING'S FIRST STEP, WITHOUT THE REDIRECT (parity audit U2). The
 *  prototype's onboarding is four screens — profile, styles, socials, take a
 *  bow (3781-3943) — and the photo, the styles and the links are written onto
 *  the profile ROW, so the row has to exist before the second screen can start
 *  (set_my_avatar and update_my_profile both say "finish onboarding first" to a
 *  person with no row). This creates the row and hands back; the client goes
 *  on to the next screen, and "Open DanceOS →" is what finally leaves.
 *  `completeProfileAction` stays for anything that still wants the one-step
 *  version. */
export async function saveProfileBasicsAction(input: unknown): Promise<{ error: string | null; created: boolean }> {
  const parsed = completeProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input", created: false };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sign in first", created: false };
  }
  const existing = await findProfileById(supabase, user.id);
  if (existing) {
    return { error: null, created: false };
  }
  try {
    await createProfile(supabase, {
      id: user.id,
      fullName: parsed.data.fullName,
      role: parsed.data.role,
      city: parsed.data.city ?? null,
    });
    /* WHY A COOKIE: every server action that revalidates a path makes the client
       refetch the CURRENT route, and /onboarding used to redirect the moment a
       profile row existed — so the photo landing (set_my_avatar revalidates
       /profile) threw the person onto Home half-way through. The row now says
       "there is a person"; this says "and they are still in the door". Cleared by
       finishOnboardingAction; a day's expiry covers an abandoned flow. */
    (await cookies()).set(ONBOARDING_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24, httpOnly: true, sameSite: "lax" });
    return { error: null, created: true };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save your profile", created: false };
  }
}

/** "Open DanceOS →" (3940): the flow is over, the cookie goes, Home is next. */
export async function finishOnboardingAction(): Promise<void> {
  (await cookies()).delete(ONBOARDING_COOKIE);
  redirect("/");
}
