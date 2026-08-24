"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone: toE164(parsed.data),
  });
  if (error) {
    return { error: error.message };
  }

  redirect(`/login/verify?phone=${parsed.data}`);
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
    type: "sms",
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
