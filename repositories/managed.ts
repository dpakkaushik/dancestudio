import type { SupabaseClient } from "@supabase/supabase-js";
import { findClassesByTenants } from "@/repositories/classes";
import { countEnrolledBySession } from "@/repositories/enrollments";
import { findEventsByTenants } from "@/repositories/events";
import { findMyTenants } from "@/repositories/tenants";
import type { ManagedListing } from "@/types/managed";
import type { Tenant } from "@/types/tenant";

/** S_managed — "everything you manage". No table, no RPC, no policy: the list
 *  is every class and every event of every business the signed-in person
 *  belongs to, read through the rows Steps 3 and 21 already keep, under the RLS
 *  they already set. The spine is MEMBERSHIP (findMyTenants says
 *  `user_id = auth.uid()` out loud) and every read here is scoped to those
 *  tenant ids: RLS is a ceiling, not a scope, and a person who can read every
 *  listed studio's published classes runs none of them.
 *
 *  Order: what is coming first, soonest at the top; what is over after it, most
 *  recent first; a class with no dated session last. A manager opens this list
 *  to act on what is next. */
export async function findEverythingIManage(supabase: SupabaseClient): Promise<{ tenants: Tenant[]; listings: ManagedListing[] }> {
  const tenants = await findMyTenants(supabase);
  if (tenants.length === 0) {
    return { tenants, listings: [] };
  }
  const ids = tenants.map((t) => t.id);
  const byId = new Map(tenants.map((t) => [t.id, t]));
  const [classes, events] = await Promise.all([findClassesByTenants(supabase, ids), findEventsByTenants(supabase, ids)]);
  const counts = await countEnrolledBySession(
    supabase,
    classes.map((c) => c.session?.id).filter((id): id is string => Boolean(id))
  );

  const listings: ManagedListing[] = [];
  for (const c of classes) {
    const tenant = byId.get(c.tenantId);
    if (!tenant) continue;
    listings.push({
      kind: "class",
      key: `class:${c.id}`,
      tenant,
      startsAt: c.session?.startsAt ?? null,
      manageHref: `/business/${c.tenantId}/classes/${c.id}/roster`,
      danceClass: c,
      filled: c.session ? counts.get(c.session.id) ?? 0 : 0,
    });
  }
  for (const e of events) {
    const tenant = byId.get(e.tenantId);
    if (!tenant) continue;
    listings.push({
      kind: "event",
      key: `event:${e.id}`,
      tenant,
      // the event's first day at its start time, on the IST clock the form took it in
      startsAt: `${e.startDate}T${e.startTime}:00+05:30`,
      manageHref: `/business/${e.tenantId}/events/${e.id}`,
      event: e,
    });
  }

  const now = Date.now();
  const stamp = (l: ManagedListing) => (l.startsAt ? new Date(l.startsAt).getTime() : Number.NaN);
  const rank = (l: ManagedListing) => {
    const t = stamp(l);
    if (Number.isNaN(t)) return 2;
    return t >= now ? 0 : 1;
  };
  listings.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return stamp(a) - stamp(b);
    if (ra === 1) return stamp(b) - stamp(a);
    return a.key.localeCompare(b.key);
  });
  return { tenants, listings };
}
