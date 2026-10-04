/** THE SIGN-IN AND SIGN-UP RULES, WITH NO LIBRARY UNDER THEM (5 Oct 2026).
 *
 *  The user: "app getting slow and laggy". The auth forms imported the Zod
 *  schemas to decide, on every keystroke, whether a button is live — and that
 *  shipped Zod (a 284 KB chunk) to the very first screens anybody opens. The
 *  rules themselves are two lines each, so they live here, plain, and BOTH the
 *  forms and the server schemas read them (`email.ts`, `password.ts` build their
 *  Zod schemas FROM these constants). That keeps the property those files were
 *  written for — the form can never enable a button the action then refuses —
 *  without the browser loading the validator.
 *
 *  ⚠ The email pattern is Zod 4's own default (`z.regexes.email`, read off the
 *  installed 4.4.3), so what is accepted did not change by one address. */

export const EMAIL_RE = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
export const EMAIL_MAX = 254;
export const EMAIL_INVALID = "Enter a valid email address";
export const EMAIL_TOO_LONG = "That email address is too long";

/** MIN IS 8, NOT SUPABASE'S 6, and MAX IS 72 because bcrypt truncates beyond
 *  72 bytes — the reasons are written beside the schema in `password.ts`. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const PASSWORD_TOO_SHORT = `Use at least ${PASSWORD_MIN} characters`;
export const PASSWORD_TOO_LONG = `Keep it under ${PASSWORD_MAX} characters`;

/** the same normalising the schema applies: trimmed and lower-cased */
const normal = (value: string) => value.trim().toLowerCase();

/** Cheap enough to run on every keystroke; returns the message to show, or null. */
export const emailProblem = (value: string): string | null => {
  if (!value.trim()) return null; // an empty field is not yet an error
  const v = normal(value);
  if (!EMAIL_RE.test(v)) return EMAIL_INVALID;
  if (v.length > EMAIL_MAX) return EMAIL_TOO_LONG;
  return null;
};

export const isEmailUsable = (value: string): boolean => {
  const v = normal(value);
  return v.length > 0 && EMAIL_RE.test(v) && v.length <= EMAIL_MAX;
};

/** Cheap enough for every keystroke; returns the message to show, or null. */
export const passwordProblem = (value: string): string | null => {
  if (!value) return null; // an empty field is not yet an error
  if (value.length < PASSWORD_MIN) return PASSWORD_TOO_SHORT;
  if (value.length > PASSWORD_MAX) return PASSWORD_TOO_LONG;
  return null;
};

export const isPasswordUsable = (value: string): boolean => value.length >= PASSWORD_MIN && value.length <= PASSWORD_MAX;
