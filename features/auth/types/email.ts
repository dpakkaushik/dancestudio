import { z } from "zod";

/** The one definition of "a usable email address", shared by the sign-in form
 *  and the server action behind it.
 *
 *  It lives in its own module because a "use server" file may only export async
 *  functions — a schema exported from the actions file could not be imported by
 *  the client. Sharing it matters: when the two drifted, the form would happily
 *  enable its button for something the action then rejected, and the person got
 *  a toast instead of a field error.
 *
 *  The client copy only decides whether the button is live. The action re-parses
 *  the same schema server-side, because frontend validation is never trusted
 *  (CLAUDE.md Security Rules). */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254, "That email address is too long");

/** Cheap enough to run on every keystroke; returns the message to show, or null. */
export const emailProblem = (value: string): string | null => {
  if (!value.trim()) return null; // an empty field is not yet an error
  const parsed = emailSchema.safeParse(value);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "Enter a valid email address");
};

export const isEmailUsable = (value: string): boolean => emailSchema.safeParse(value).success;
