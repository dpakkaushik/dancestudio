import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantType } from "@/types/tenant";

/** THE ORGANIZATION'S FIGURES (17 Sep 2026). The user: "an org can have multiple
 *  studios at different locations and can host events, so stats will show the
 *  combined as well as separate stats for all the studios under the org."
 *
 *  One RPC, `my_org_stats()`: a row per business the caller OWNS — its studios
 *  and its event-hosting row — every figure summed in SQL (this project's
 *  PostgREST has aggregates switched off, and a dashboard's total must never be
 *  a partial sum). SECURITY DEFINER, scoped to auth.uid(), and it takes NO
 *  argument: you can ask about your own businesses and nobody else's. The
 *  screen adds the rows up for the combined view; the rows are the per-studio
 *  view. The hosting row's money IS the event money, because an event's
 *  payment is keyed on its host. */

export interface OrgStatsRow {
  businessId: string;
  name: string;
  type: TenantType;
  visibility: "listed" | "unlisted";
  verifiedAt: string | null;
  /** live classes, whatever their status */
  classes: number;
  /** sessions that have ended, on published or completed classes */
  sessionsHeld: number;
  /** capacity summed over those sessions, and the enrolled seats on them — the fill */
  seatsOffered: number;
  seatsTaken: number;
  /** live enrolled seats, past and future */
  bookings: number;
  /** captured payments (a refunded one still came in) */
  grossInr: number;
  /** refunds actually processed */
  refundedInr: number;
  /** captured this IST calendar month */
  monthGrossInr: number;
  followers: number;
  events: number;
  ticketsSold: number;
  entries: number;
}

interface Row {
  business_id: string;
  name: string;
  type: TenantType;
  visibility: "listed" | "unlisted";
  verified_at: string | null;
  classes: number;
  sessions_held: number;
  seats_offered: number;
  seats_taken: number;
  bookings: number;
  gross_inr: number | string;
  refunded_inr: number | string;
  month_gross_inr: number | string;
  followers: number;
  events: number;
  tickets_sold: number;
  entries: number;
}

export async function findMyOrgStats(supabase: SupabaseClient): Promise<OrgStatsRow[]> {
  const { data, error } = await supabase.rpc("my_org_stats");
  if (error) {
    throw new Error(`orgStats.mine failed: ${error.message}`);
  }
  return ((data ?? []) as Row[]).map((r) => ({
    businessId: r.business_id,
    name: r.name,
    type: r.type,
    visibility: r.visibility,
    verifiedAt: r.verified_at,
    classes: Number(r.classes),
    sessionsHeld: Number(r.sessions_held),
    seatsOffered: Number(r.seats_offered),
    seatsTaken: Number(r.seats_taken),
    bookings: Number(r.bookings),
    /* bigint arrives as a number inside JSON's safe range; Number() guards the string case */
    grossInr: Number(r.gross_inr),
    refundedInr: Number(r.refunded_inr),
    monthGrossInr: Number(r.month_gross_inr),
    followers: Number(r.followers),
    events: Number(r.events),
    ticketsSold: Number(r.tickets_sold),
    entries: Number(r.entries),
  }));
}
