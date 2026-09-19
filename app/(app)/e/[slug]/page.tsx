import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { EventPage } from "@/features/events/components/EventPage";
import { dayKeyOf } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyLedCrews } from "@/repositories/crews";
import { findEventBySlug, findMyBookingsForEvent } from "@/repositories/events";
import { findEventHostCards } from "@/repositories/publicOrganization";
import { findProfileById } from "@/repositories/profiles";
import { findMyMembershipRole } from "@/repositories/tenants";
import { photoUrl } from "@/lib/media/photo";
import { TYPE_LABEL } from "@/types/event";
import { canBook } from "@/types/profile";

/** The event page at its booking link — /e/{slug} (prototype S_event 12810).
 *  Works signed out: RLS shows the public only published events of listed
 *  businesses, so a draft's link 404s for strangers and resolves for the
 *  organiser's own members. */

const SLUG_RE = /^[a-z0-9][a-z0-9-]{3,38}[a-z0-9]$/;

const stampNowIso = (): string => new Date().toISOString();

/* one lookup shared by the page and its metadata */
const loadEvent = cache(async (slug: string) => {
  const supabase = await createSupabaseServerClient();
  return findEventBySlug(supabase, slug);
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return { title: "Event — DanceOS" };
  const ev = await loadEvent(slug);
  if (!ev) return { title: "Event — DanceOS" };
  return {
    title: `${ev.title} — ${ev.tenantName} · DanceOS`,
    description: `${TYPE_LABEL[ev.cat]} by ${ev.tenantName} at ${ev.venue}, ${ev.city}. Book on DanceOS.`,
  };
}

export default async function EventSharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) {
    notFound();
  }
  const ev = await loadEvent(slug);
  if (!ev) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* Step 22: a crew is entered from the crews you LEAD (13397-13420) */
  const wantsCrews = Boolean(user) && ev.entryTiers.some((t) => t.format === "crew");
  const [role, mine, ledCrews, hosts, viewerProfile] = await Promise.all([
    user ? findMyMembershipRole(supabase, ev.tenantId) : Promise.resolve(null),
    user ? findMyBookingsForEvent(supabase, ev.id, user.id) : Promise.resolve([]),
    wantsCrews ? findMyLedCrews(supabase) : Promise.resolve([]),
    /* the organization behind the event, with its picture and its page (18 Sep 2026) */
    findEventHostCards(supabase, [ev.tenantId]),
    /* WHO IS READING: an organization runs events and takes no place at one (19 Sep 2026) */
    user ? findProfileById(supabase, user.id).catch(() => null) : Promise.resolve(null),
  ]);
  const hostCard = hosts.get(ev.tenantId) ?? null;

  return (
    <EventPage
      event={ev}
      isSignedIn={Boolean(user)}
      isMember={role !== null}
      canManage={role === "owner" || role === "trainer"}
      mine={mine}
      ledCrews={ledCrews.map((c) => ({ id: c.id, name: c.name, members: c.members }))}
      todayKey={dayKeyOf(stampNowIso())}
      host={hostCard ? { name: hostCard.name, photo: photoUrl(hostCard.photoPath ?? undefined), href: hostCard.orgId ? `/org/${hostCard.orgId}` : null } : null}
      viewerCanBook={canBook(viewerProfile?.role)}
    />
  );
}
