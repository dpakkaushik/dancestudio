import type { SupabaseClient } from "@supabase/supabase-js";

/** A STUDIO'S OWN REFUND WINDOW (11 Oct 2026, `20261016090000`).
 *
 *  `businesses.refund_window_hours` — a learner cancelling at least this many
 *  hours before a class is refunded automatically; later, the studio decides.
 *  `_cancel_one_class_booking` reads it, so every screen that PRINTS the rule
 *  reads it here rather than typing "12 h".
 *
 *  The default is 12, and so is every fallback: a read that fails (RLS says no,
 *  the column is not there yet because the app deployed ahead of the migration)
 *  answers 12, which is what the database itself uses when the row says nothing.
 *  A screen must never fail over the sentence that explains a policy. */
export const DEFAULT_REFUND_WINDOW_HOURS = 12;

export async function findRefundWindowHours(supabase: SupabaseClient, businessId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("businesses")
      .select("refund_window_hours")
      .eq("id", businessId)
      .maybeSingle();
    if (error || !data) return DEFAULT_REFUND_WINDOW_HOURS;
    const n = Number((data as { refund_window_hours: number | null }).refund_window_hours);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_REFUND_WINDOW_HOURS;
  } catch {
    return DEFAULT_REFUND_WINDOW_HOURS;
  }
}

/** The window of the business a class booking belongs to — for the sentence a
 *  learner reads after cancelling, when the action holds only the booking's id.
 *  The booking is the payer's own row (Step 4's policy), so it is readable. */
export async function findRefundWindowHoursForBooking(supabase: SupabaseClient, classBookingId: string): Promise<number> {
  try {
    const { data, error } = await supabase.from("class_bookings").select("business_id").eq("id", classBookingId).maybeSingle();
    const businessId = (data as { business_id: string | null } | null)?.business_id;
    if (error || !businessId) return DEFAULT_REFUND_WINDOW_HOURS;
    return await findRefundWindowHours(supabase, businessId);
  } catch {
    return DEFAULT_REFUND_WINDOW_HOURS;
  }
}

/** The owner sets it (`set_refund_window`, 0–168, owner only inside the RPC).
 *  Throws the database's own words. Returns the hours saved. */
export async function setRefundWindow(supabase: SupabaseClient, businessId: string, hours: number): Promise<number> {
  const { data, error } = await supabase.rpc("set_refund_window", {
    p_business_id: businessId,
    p_hours: hours,
  });
  if (error) {
    throw new Error(error.message);
  }
  return Number(data ?? hours);
}

/** "12 hours" / "1 hour" / "no notice" — the window in words, one grammar for
 *  every sentence that prints it. */
export function refundWindowWords(hours: number): string {
  if (hours <= 0) return "0 hours";
  return hours === 1 ? "1 hour" : `${hours} hours`;
}
