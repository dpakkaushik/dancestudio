import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** THE EMAIL LEDGER (30 Sep 2026) — the writer for `email_events`, which
 *  `20260929150000` created and nothing had ever written to.
 *
 *  ⚠⚠ ITS SHAPE FOLLOWS FROM A FACT THAT WAS CHECKED RATHER THAN ASSUMED: THIS
 *  APP SENDS NO EMAIL AT ALL. Every message a person receives is sent by
 *  Supabase Auth over Resend SMTP; there is no Resend API call anywhere in the
 *  tree. So a log written where the app "sends" could only ever record *we asked
 *  Supabase to ask Resend*, which is already in the auth logs and is not the
 *  question anybody has. **The delivery outcome exists only at Resend**, which
 *  is why this is a webhook ledger in `webhook_events`' exact shape rather than
 *  a send log.
 *
 *  ⚠ IDEMPOTENT BY CONSTRUCTION, NOT BY CARE: `provider_event_id` is UNIQUE, so
 *  a redelivery is a duplicate key and a no-op. That matters more than it looks
 *  — **a log that counts a retry as a second bounce invents a failure**, and
 *  Svix retries for days.
 *
 *  ⚠ APPEND ONLY, with no status column that can go backwards. Two events about
 *  one message are two rows, in the order they happened.
 */

export interface EmailEventInput {
  providerEventId: string;
  eventType: string;
  messageId: string | null;
  toEmail: string | null;
  subject: string | null;
  detail: string | null;
  payload: unknown;
}

export type EmailEventOutcome = "recorded" | "duplicate";

export async function recordEmailEvent(input: EmailEventInput): Promise<EmailEventOutcome> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("email_events").insert({
    provider_event_id: input.providerEventId,
    provider: "resend",
    message_id: input.messageId,
    event_type: input.eventType,
    to_email: input.toEmail,
    subject: input.subject,
    detail: input.detail,
    payload: input.payload,
  });

  if (!error) {
    return "recorded";
  }
  /* 23505 — the unique index doing its job. A redelivery is not a failure, and
     answering Resend with anything but 200 would make it retry for ever. */
  if (error.code === "23505") {
    return "duplicate";
  }
  throw new Error(`email_events.record failed: ${error.message}`);
}
