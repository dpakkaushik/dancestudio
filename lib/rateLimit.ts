import { createHash } from "node:crypto";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/** RATE LIMITS (18 Sep 2026, the user: "set a good limit"). RLS decides who may
 *  do a thing; this decides how often, in front of the five doors a stranger or
 *  a script could lean on. One call per action, before the work: the database
 *  counts a hit on (bucket, caller) in a fixed window and answers whether it is
 *  still inside the limit (`rate_limit_hit`, `20260918174000_rate_limits.sql`).
 *  A signed-in caller is their `auth.uid()`; a signed-out one is a hash of the
 *  address the request came from — never the address itself, which is not ours
 *  to keep.
 *
 *  THE LIMITS, in one place, in words a person would agree with:
 *  - people search: 60 a minute — a keystroke a second, for a minute, is typing
 *  - an enquiry: 10 an hour — nobody sincerely asks eleven businesses in an hour
 *  - a report: 5 an hour — enough to report a page and its owner, not a campaign
 *  - a support thread: 5 an hour
 *  - sign-up: 5 an hour from one address — a household, not a farm
 *
 *  A refused hit is the same shape as every other refusal in this app: a
 *  sentence the screen prints, never an exception the person sees. If the
 *  counter itself fails (the function missing, a network blip) the action goes
 *  AHEAD — a limit that cannot be counted must not be the reason a real person
 *  is refused. */

export const LIMITS = {
  peopleSearch: { bucket: "people.search", limit: 60, windowSeconds: 60, words: "Slow down a moment — that is a lot of searching." },
  enquiry: { bucket: "enquiry.send", limit: 10, windowSeconds: 3600, words: "That is ten enquiries in an hour. Give the last ones a little time to be answered." },
  report: { bucket: "report.content", limit: 5, windowSeconds: 3600, words: "You have reported five things this hour. DanceOS is reading them; more can wait." },
  supportThread: { bucket: "support.open", limit: 5, windowSeconds: 3600, words: "Five conversations in an hour is plenty — add to one of them instead." },
  signUp: { bucket: "auth.signup", limit: 5, windowSeconds: 3600, words: "Too many accounts from here in the last hour. Try again later." },
} as const;

export type RateLimit = (typeof LIMITS)[keyof typeof LIMITS];

/** a stable, non-reversible key for a signed-out request: the address, hashed */
export async function clientKey(): Promise<string> {
  try {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim() || "unknown";
    return createHash("sha256").update(`dos:${ip}`).digest("hex").slice(0, 32);
  } catch {
    return "unknown";
  }
}

/** true when the caller may go ahead; false when the words should be printed */
export async function withinLimit(supabase: SupabaseClient, rule: RateLimit, client?: string | null): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("rate_limit_hit", {
      p_bucket: rule.bucket,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
      p_client: client ?? null,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}
