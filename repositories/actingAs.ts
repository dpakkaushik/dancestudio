import type { SupabaseClient } from "@supabase/supabase-js";
import { findMyLedCrews } from "@/repositories/crews";
import { findMyMemberships } from "@/repositories/tenants";
import type { ActingAs } from "@/types/profile";

/** ⚠⚠ WHICH PROFILE AM I ACTING AS — the question `profiles.role` used to
 *  answer and cannot any more (27 Sep 2026; see `canBookClass` for what died
 *  and why).
 *
 *  An organization is a BUSINESS a person opens (R48), so the account browsing
 *  Discover is always a `user` whatever it is standing in. What decides is the
 *  profile it switched into — and `/discover`, `/c/{slug}` and `/e/{slug}`
 *  belong to no profile at all, so the entity bar's Discover link carries it
 *  (`?as=`) and the cards pass it on to the page they open.
 *
 *  ⚠ A POINTER IS NEVER AN AUTHORITY — the app's own rule since `?business=` on
 *  the memberships form (21 Sep). `?as=` is a REQUEST, and this looks it up
 *  among the businesses this account is on the team of and the crews it leads.
 *  A stranger's id, a made-up id and an id this person left all resolve to
 *  `null`, which means "yourself" — the permissive answer, deliberately: this
 *  is a presentation gate, and failing it closed would take a booking away from
 *  somebody who is entitled to one.
 *
 *  ⚠ AND IT IS SHAPED SO A FORGED VALUE GAINS NOTHING even if it did resolve:
 *  what it returns can only ever REMOVE a button. */
const CREW = "crew-";

/** the value the entity bar puts on its Discover link */
export const asParam = (kind: "studio" | "org" | "crew", id: string): string => (kind === "crew" ? `${CREW}${id}` : id);

/** carry it onto a card's own href, so the page agrees with the card that sent you */
export const withAs = (href: string, as: string | null): string => (as ? `${href}${href.includes("?") ? "&" : "?"}as=${encodeURIComponent(as)}` : href);

export async function resolveActingAs(supabase: SupabaseClient, raw: string | null | undefined): Promise<ActingAs> {
  const v = (raw ?? "").trim();
  if (!v) return null;

  if (v.startsWith(CREW)) {
    const id = v.slice(CREW.length);
    const crews = await findMyLedCrews(supabase).catch(() => []);
    const crew = crews.find((c) => c.id === id);
    return crew ? { kind: "crew", name: crew.name } : null;
  }

  const mine = await findMyMemberships(supabase).catch(() => []);
  const m = mine.find((x) => x.tenant.id === v);
  if (!m) return null;
  /* an ARTIST PAGE is the person's own public face, not a profile they switch
     into — they book as themselves there, so it is not a business for this */
  if (m.tenant.type === "artist_page") return null;
  return { kind: m.tenant.type === "org" ? "org" : "studio", name: m.tenant.name };
}
