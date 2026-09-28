import type { SupabaseClient } from "@supabase/supabase-js";
import { findMyLedCrews } from "@/repositories/crews";
import { findMyMemberships, runsTheBusiness } from "@/repositories/tenants";
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
 *  what it returns can only ever REMOVE a button.
 *
 *  ⚠ IT CARRIES THE RESOLVED `id` SINCE 27 Sep 2026, because the Enquiries tool
 *  tile uses the same pointer to say WHICH profile's desk it opens — and that id
 *  is the one this lookup just proved the caller belongs to, never the one the
 *  URL asked for. A desk NARROWED by it shows less, not more, and the reads
 *  underneath are RLS-bounded either way, so the rule above still holds: an
 *  unresolvable value means "yourself", which here is every subject you are
 *  entitled to and not a refusal. */
const CREW = "crew-";

/** carry it onto a card's own href, so the page agrees with the card that sent you */
export const withAs = (href: string, as: string | null): string => (as ? `${href}${href.includes("?") ? "&" : "?"}as=${encodeURIComponent(as)}` : href);

export async function resolveActingAs(supabase: SupabaseClient, raw: string | null | undefined): Promise<ActingAs> {
  const v = (raw ?? "").trim();
  if (!v) return null;

  if (v.startsWith(CREW)) {
    const id = v.slice(CREW.length);
    const crews = await findMyLedCrews(supabase).catch(() => []);
    const crew = crews.find((c) => c.id === id);
    return crew ? { kind: "crew", name: crew.name, id: crew.id } : null;
  }

  const mine = await findMyMemberships(supabase).catch(() => []);
  const m = mine.find((x) => x.tenant.id === v);
  if (!m) return null;
  /* ⚠ AND THE SEAT HAS TO RUN IT (28 Sep 2026). Acting AS a business is exactly
     the identity the switcher hands out, and the switcher stopped offering it to
     a faculty seat — so admitting one here would be a second answer to one
     question. Nothing can produce the link any more, which is why this is
     tidiness rather than a hole: the value only ever REMOVES a button (the rule
     above), and the Enquiries desk it also scopes narrows rather than widens. */
  if (!runsTheBusiness(m.memberRole)) return null;
  /* an ARTIST PAGE is the person's own public face, not a profile they switch
     into — they book as themselves there, so it is not a business for this */
  if (m.tenant.type === "artist_page") return null;
  return { kind: m.tenant.type === "org" ? "org" : "studio", name: m.tenant.name, id: m.tenant.id };
}
