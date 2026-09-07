import { z } from "zod";
import { emailSchema } from "@/features/auth/types/email";

/** Password rules, shared by the forms and the server actions behind them.
 *
 *  Same reason as `email.ts` for living in its own module: a "use server" file
 *  may only export async functions, so a schema exported from the actions file
 *  could not be imported by a client component. Sharing the definition is what
 *  stops a form enabling its button for something the action then rejects.
 *
 *  MIN IS 8, NOT SUPABASE'S 6. Six characters is inside brute-force range for
 *  an offline attack on a leaked hash, and Supabase's default is a floor rather
 *  than a recommendation. MAX IS 72 because bcrypt silently truncates beyond 72
 *  bytes — a longer password would appear to be accepted and then match on only
 *  its first 72 bytes, which is worse than refusing it. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Keep it under ${PASSWORD_MAX} characters`);

/** Sign-up: both fields, and they have to agree.
 *
 *  The confirm field is checked server-side too, not just in the browser. A
 *  mismatched pair posted directly would otherwise set a password the person
 *  never typed twice — and they would find out at the next sign-in, with no way
 *  to tell what went wrong. */
export const signUpSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: "Those two passwords don't match",
    path: ["confirm"],
  });

/** Sign-in deliberately does NOT reuse `passwordSchema`.
 *
 *  Rejecting a 6-character password at the sign-in form would lock out any
 *  account created before this rule existed — including the demo users, whose
 *  password is set by scripts/demo-data.js. Length is a rule about what you may
 *  CHOOSE, not about what you may type to prove who you are. Supabase decides
 *  whether the credentials are right. */
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

/** Setting a new password after a recovery link — no email, the session says who. */
export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: "Those two passwords don't match",
    path: ["confirm"],
  });

/** Cheap enough for every keystroke; returns the message to show, or null. */
export const passwordProblem = (value: string): string | null => {
  if (!value) return null; // an empty field is not yet an error
  const parsed = passwordSchema.safeParse(value);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "That password won't do");
};

export const isPasswordUsable = (value: string): boolean =>
  passwordSchema.safeParse(value).success;
