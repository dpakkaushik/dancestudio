"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ONBOARDING_COOKIE } from "@/lib/auth/onboarding";
import { emailSchema } from "@/features/auth/types/email";
import {
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/features/auth/types/password";
import { createProfile, findProfileById } from "@/repositories/profiles";

export interface AuthActionState {
  error: string | null;
}

const completeProfileSchema = z.object({
  fullName: z.string().trim().min(1, "Tell us your name").max(120),
  role: z.enum(["dancer", "trainer", "studio"]),
  city: z.string().trim().max(120).optional(),
});

/** WHERE A LINK IN AN EMAIL HAS TO POINT.
 *
 *  Every emailed link is built from this origin, and it has to be one that
 *  Supabase's redirect allow-list already contains. The `origin` header is
 *  whatever host the browser used — a preview deployment, an IP, a tunnel — and
 *  a link minted for an unlisted origin is refused at /auth/confirm with no
 *  clue as to why. NEXT_PUBLIC_SITE_URL pins the canonical one; the header is
 *  the local-dev fallback. */
async function emailLinkOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  return configured || (await headers()).get("origin") || "http://127.0.0.1:3000";
}

/** SIGN UP — email + password, verified by a link before the account is usable.
 *
 *  AUTH IS EMAIL + PASSWORD AS OF 7 SEP 2026. The passwordless magic link that
 *  used to be the only channel is now the recovery path only
 *  (`requestPasswordResetAction`) — a returning user signs in with a password
 *  and needs no email at all, which takes the mailer off the busiest route.
 *
 *  WHY THIS ALWAYS REPORTS SUCCESS. With email confirmation on, Supabase
 *  answers `signUp` for an address that already exists with a user object and
 *  no identities, and sends nothing — deliberately, so an attacker cannot use
 *  the signup form to discover who has an account. Surfacing "that email is
 *  taken" here would hand back exactly the answer Supabase is refusing to give.
 *  So both cases land on the same check-your-inbox screen: a new address gets a
 *  verification link, an existing one gets nothing, and neither the person nor
 *  an attacker learns which happened from the response. Someone who genuinely
 *  owns the address and forgot they had signed up reaches the same place via
 *  "Forgot password". */
export async function signUpAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check those details" };
  }

  const origin = await emailLinkOrigin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) {
    return { error: error.message };
  }

  redirect(
    `/login/check-email?email=${encodeURIComponent(parsed.data.email)}&mode=verify`
  );
}

/** SIGN IN — existing account, email + password, no email sent.
 *
 *  The error is whatever Supabase says, which for bad credentials is the
 *  deliberately vague "Invalid login credentials" whether the address exists or
 *  not. Do not improve on it: distinguishing "no such account" from "wrong
 *  password" turns this form into a check for whether somebody has an account.
 *
 *  An unverified account cannot sign in while `mailer_autoconfirm` is off, and
 *  Supabase says so ("Email not confirmed") — that one IS worth passing on,
 *  because the fix is in the person's inbox rather than in their memory. */
export async function signInWithPasswordAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check those details" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) {
    return { error: error?.message ?? "Could not sign you in" };
  }

  /* The same fork /auth/confirm makes: an account whose onboarding never
     finished has no profiles row, and Home is not usable without one. */
  const profile = await findProfileById(supabase, data.user.id);
  redirect(profile ? "/" : "/onboarding");
}

/** FORGOT PASSWORD — sends a recovery link, which lands on /login/reset.
 *
 *  This is `resetPasswordForEmail`, NOT the old `signInWithOtp`. A plain magic
 *  link would sign the person in and leave the password they cannot remember
 *  exactly as it was — in the app, but still locked out at the next sign-in.
 *  The recovery link carries `type=recovery`, which /auth/confirm routes to the
 *  set-a-new-password screen instead of Home.
 *
 *  Reports success for an unknown address too, for the same
 *  no-account-enumeration reason as signUpAction. */
export async function requestPasswordResetAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid email" };
  }

  const origin = await emailLinkOrigin();
  const supabase = await createSupabaseServerClient();
  /* `flow=recovery` rather than relying on `type`: the stock email template
     sends a PKCE `code` and no type at all, so without this stamp /auth/confirm
     cannot tell a reset link from a signup confirmation and would drop the
     person on Home — signed in, and still not knowing their password. Supabase
     keeps the query it is handed and appends its own. */
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/confirm?flow=recovery`,
  });
  if (error) {
    return { error: error.message };
  }

  redirect(`/login/check-email?email=${encodeURIComponent(parsed.data)}&mode=reset`);
}

/** SET A NEW PASSWORD, after a recovery link has been redeemed.
 *
 *  No email field: the recovery link already established a session, and that
 *  session is the only thing that says whose password this is. Checking for it
 *  is the authorization step — without it this action would let anybody who can
 *  POST set a password, and the form being unreachable is not a control
 *  (CLAUDE.md Security Rules: never trust the frontend). */
export async function setNewPasswordAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check those details" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: "That reset link has expired — ask for a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: error.message };
  }

  const profile = await findProfileById(supabase, user.id);
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
