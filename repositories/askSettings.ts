import type { SupabaseClient } from "@supabase/supabase-js";

/** WHAT ASKS SOMEBODY TAKES (3 Oct 2026, the user: "request and invite settings
 *  for inbox"). A person switches off kinds of ask — to teach, to assist, to
 *  join a team, to join a crew — and a studio switches off room requests. Both
 *  are refused at the row (`guard_ask_switched_on`, `guard_room_requests_open`),
 *  so every door that asks meets the same refusal in words. */

export type AskKind = "teach" | "assist" | "team" | "crew";
export const ASK_KINDS: AskKind[] = ["teach", "assist", "team", "crew"];

/** the kinds this person has switched OFF — empty means everything arrives.
 *  Read narrowly, like `layout`: a preference about one's own Inbox, not part of
 *  the profile everybody else reads. Never throws — a setting must never be why
 *  the Inbox does not render. */
export async function findMyInboxOff(supabase: SupabaseClient, userId: string): Promise<AskKind[]> {
  const { data, error } = await supabase.from("profiles").select("inbox_off").eq("id", userId).maybeSingle();
  if (error || !data) return [];
  const raw = (data as { inbox_off: string[] | null }).inbox_off ?? [];
  return raw.filter((k): k is AskKind => (ASK_KINDS as string[]).includes(k));
}

export async function setMyInboxOff(supabase: SupabaseClient, off: AskKind[]): Promise<AskKind[]> {
  const { data, error } = await supabase.rpc("set_my_inbox_off", { p_off: off });
  if (error) {
    throw new Error(error.message);
  }
  return ((data as string[] | null) ?? []).filter((k): k is AskKind => (ASK_KINDS as string[]).includes(k));
}

/** whether a studio takes room requests — true unless its owner switched it off */
export async function findTakesRoomRequests(supabase: SupabaseClient, businessId: string): Promise<boolean> {
  const { data, error } = await supabase.from("businesses").select("takes_room_requests").eq("id", businessId).maybeSingle();
  if (error || !data) return true;
  return (data as { takes_room_requests: boolean | null }).takes_room_requests !== false;
}

export async function setRoomRequests(supabase: SupabaseClient, businessId: string, on: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_room_requests", { p_business_id: businessId, p_on: on });
  if (error) {
    throw new Error(error.message);
  }
}
