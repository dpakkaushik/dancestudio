/** Step 26 — the OTP channel, in one place.
 *
 *  Step 1 decided this on 18 Aug 2026 and parked it: "production OTP is
 *  WhatsApp-first (Supabase channel 'whatsapp' via Twilio Verify — needs Meta
 *  business verification + an approved authentication template) with SMS
 *  fallback (needs India DLT registration)". The code change was always one
 *  argument; what it waited on was two accounts and a verification.
 *
 *  So the argument is here, behind an environment switch, and the app tells the
 *  truth about which way a code went. `AUTH_OTP_CHANNEL=whatsapp` sends on
 *  WhatsApp; anything else (including unset) sends by SMS, which is what the
 *  project is configured for today — phone sign-in is on, the provider is
 *  Twilio, and no Twilio credentials are set, so only Supabase's test numbers
 *  can receive anything at all. Turning WhatsApp on is one env var, on this
 *  machine and in the Vercel project, once the Twilio sender and the Meta
 *  template exist.
 *
 *  `AUTH_OTP_FALLBACK_SMS=true` adds the second half of Step 1's decision: if
 *  WhatsApp refuses (no template approved yet, the number is not on WhatsApp,
 *  the provider is down), the code goes by SMS instead and the screen says SMS
 *  — never "sent on WhatsApp" for a message that went the other way.
 *
 *  Pure and server-only-by-convention: no Supabase import, so the decision can
 *  be tested on its own. */

export type OtpChannel = "sms" | "whatsapp";

export const isOtpChannel = (v: string | undefined): v is OtpChannel => v === "sms" || v === "whatsapp";

/** What the app is configured to try FIRST. */
export const preferredOtpChannel = (env: NodeJS.ProcessEnv = process.env): OtpChannel =>
  isOtpChannel(env.AUTH_OTP_CHANNEL?.trim().toLowerCase()) ? (env.AUTH_OTP_CHANNEL!.trim().toLowerCase() as OtpChannel) : "sms";

/** Whether a refused WhatsApp send may fall back to SMS (Step 1's second half). */
export const smsFallbackEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  (env.AUTH_OTP_FALLBACK_SMS ?? "").trim().toLowerCase() === "true";

/** The order to try, given the switches. One entry unless a fallback is armed. */
export const otpChannelPlan = (env: NodeJS.ProcessEnv = process.env): OtpChannel[] => {
  const first = preferredOtpChannel(env);
  return first === "whatsapp" && smsFallbackEnabled(env) ? ["whatsapp", "sms"] : [first];
};

/** How a code arriving on this channel is described, in the app's own voice. */
export const OTP_CHANNEL_WORDS: Record<OtpChannel, { sent: string; short: string; verb: string }> = {
  sms: { sent: "by SMS", short: "SMS", verb: "text" },
  whatsapp: { sent: "on WhatsApp", short: "WhatsApp", verb: "WhatsApp" },
};

/** Supabase verifies a phone OTP with type "sms" whatever channel carried it —
 *  the channel is a delivery choice, not a different kind of token. Named here
 *  so no call site has to remember why. */
export const OTP_VERIFY_TYPE = "sms" as const;
