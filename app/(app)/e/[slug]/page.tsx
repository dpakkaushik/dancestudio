import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { EventPage } from "@/features/events/components/EventPage";
import { dayKeyOf } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findEventBySlug, findMyBookingsForEvent } from "@/repositories/events";
import { findMyMembershipRole } from "@/repositories/tenants";
import { TYPE_LABEL } from "@/types/event";

/** The event page at its booking link — /e/{slug} (prototype S_event 12810).
 *  Works signed out: RLS shows the public only published events of listed
 *  tenants, so a draft's link 404s for strangers and resolves for the
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

  const [role, mine] = await Promise.all([
    user ? findMyMembershipRole(supabase, ev.tenantId) : Promise.resolve(null),
    user ? findMyBookingsForEvent(supabase, ev.id, user.id) : Promise.resolve([]),
  ]);

  return (
    <EventPage
      event={ev}
      isSignedIn={Boolean(user)}
      isMember={role !== null}
      canManage={role === "owner" || role === "trainer"}
      mine={mine}
      todayKey={dayKeyOf(stampNowIso())}
    />
  );
}
