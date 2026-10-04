import { z } from "zod";
import { EMAIL_INVALID, EMAIL_MAX, EMAIL_RE, EMAIL_TOO_LONG } from "@/features/auth/types/rules";

/** The one definition of "a usable email address", shared by the sign-in form
 *  and the server action behind it.
 *
 *  It lives in its own module because a "use server" file may only export async
 *  functions — a schema exported from the actions file could not be imported by
 *  the client. Sharing it matters: when the two drifted, the form would happily
 *  enable its button for something the action then rejected, and the person got
 *  a toast instead of a field error.
 *
 *  ⚠ SINCE 5 Oct 2026 THE FORMS DO NOT IMPORT THIS FILE: they read the plain
 *  rules in `rules.ts`, which this schema is BUILT FROM, so the browser no longer
 *  loads Zod to grey a button. The action re-parses this schema server-side,
 *  because frontend validation is never trusted (CLAUDE.md Security Rules). */
export const emailSchema = z.string().trim().toLowerCase().regex(EMAIL_RE, EMAIL_INVALID).max(EMAIL_MAX, EMAIL_TOO_LONG);

export { emailProblem, isEmailUsable } from "@/features/auth/types/rules";
