import Link from "next/link";
import { redirect } from "next/navigation";
import { EventCard } from "@/features/events/components/EventCard";
import { EvIcon, bookingWords, eventCodeOf, eventTimeWords, eventWhen } from "@/features/events/components/event-kit";
import { SegmentedPanels } from "@/features/shell/components/SegmentedNav";
import { DeskHero } from "@/features/tenants/components/biz-kit";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findEventsByTenants, findMyEventBookings } from "@/repositories/events";
import { findMyMemberships } from "@/repositories/tenants";
import { EV_TINT, TYPE_LABEL, type DanceEvent, type MyEventBooking } from "@/types/event";

/** YOUR EVENTS — the Home grid's Events tile (18 Sep 2026, the user's list for a
 *  person: "Events — Booked as Participant, Booked as Spectator, for Assisting").
 *  Three segments over rows that already exist:
 *   · PARTICIPANT — the entries you hold (a solo, a duet, a crew you lead);
 *   · SPECTATOR — the seats you hold;
 *   · ASSISTING — the events run by a business you are on the team of but do
 *     not own: you help run the door, so the row opens the manager.
 *  A ticket row is the "Your tickets" row that lived under the classes until
 *  today (S_bookings 6099); an assisting row is the app's one event card. */
type Show = "participant" | "spectator" | "assisting";
const SHOWS: Array<{ k: Show; label: string; aria: string }> = [
  { k: "participant", label: "Participant", aria: "Show the events you entered" },
  { k: "spectator", label: "Spectator", aria: "Show the events you have a seat at" },
  { k: "assisting", label: "Assisting", aria: "Show the events you help run" },
];

function TicketRow({ t }: { t: MyEventBooking }) {
  const tint = EV_TINT[t.eventCat];
  return (
    <Link
      href={`/e/${t.eventShareSlug}`}
      aria-label={`Open ${t.eventTitle}`}
      style={{ display: "flex", alignItems: "center", gap: 11, background: "var(--card)", border: "1px solid var(--el)", borderLeft: `4px solid ${tint}`, borderRadius: 16, padding: "11px 13px", marginBottom: 8, textDecoration: "none", color: INK }}
    >
      <span style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, background: `${tint}1f`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <EvIcon cat={t.eventCat} size={18} color={tint} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.eventTitle}</span>
        <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 1 }}>
          {eventWhen(t.startDate, t.startDate)} · {eventTimeWords(t.startTime)} · {t.venue}
        </span>
        <span style={{ display: "block", fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
          {TYPE_LABEL[t.eventCat]} · {bookingWords(t)}
        </span>
      </span>
      <span style={{ flexShrink: 0, textAlign: "right" }}>
        <span style={{ display: "block", fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace', fontSize: 10, color: "var(--muted)" }}>{eventCodeOf(t.id)}</span>
        <span style={{ display: "block", fontSize: 10.5, fontWeight: 800, color: tint, marginTop: 3 }}>{t.checkedInAt ? "Checked in" : t.amountInr > 0 ? `₹${t.amountInr}` : "Free"}</span>
      </span>
    </Link>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div style={{ textAlign: "center", padding: "40px 20px", color: SUB, border: "1.5px dashed var(--el)", borderRadius: 20, fontSize: 13, lineHeight: 1.5 }}>{children}</div>
);

export default async function MyEventsPage({ searchParams }: { searchParams: Promise<{ show?: string | string[] }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const { show: rawShow } = await searchParams;
  const s = Array.isArray(rawShow) ? rawShow[0] : rawShow;
  const show: Show = s === "spectator" || s === "assisting" ? s : "participant";

  const [tickets, memberships] = await Promise.all([findMyEventBookings(supabase, user.id), findMyMemberships(supabase)]);
  /* the businesses you help run — a member who is not the owner */
  const helpingIds = memberships.filter((m) => m.memberRole !== "owner").map((m) => m.tenant.id);
  /* ⚠ READ WHATEVER SEGMENT IS OPEN (19 Sep 2026): the Assisting pill carries a
     COUNT now, so the number has to be true from the Participant segment too */
  const assisting: DanceEvent[] = helpingIds.length ? (await findEventsByTenants(supabase, helpingIds).catch(() => [])).filter((ev) => ev.status !== "draft") : [];
  const entries = tickets.filter((t) => t.kind === "participant");
  const seats = tickets.filter((t) => t.kind === "spectator");
  const nOf = (k: Show) => (k === "participant" ? entries.length : k === "spectator" ? seats.length : assisting.length);

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "14px 16px 40px", boxSizing: "border-box" }}>
      {/* THE TOOL'S HERO (18 Sep 2026, the user: "all heading when inside the page
          should have similar design as Crew, Calendar etc.") — the Events tile's
          own colour and word, where a 17px "Your events" line stood */}
      {/* ⚠ NO "FIND EVENTS" CHIP (19 Sep 2026, the user's list) — Discover is a tab
          in the bar, and the row that held the chip also held the total, which
          moved down onto the list it counts. The hero's own margin is the gap. */}
      <DeskHero tool="events" as="h1" margin="0 0 14px" />

      {/* ⚠ THE SWITCH IS INSTANT (20 Sep 2026, the user: "CLASSES LAG ISSUE IS
          THERE WHEN SWITCHING COLUMNS" — the same control, so the same fix).
          All three lists were ALREADY read in one pass here, because each pill
          carries a count; the only thing the server round trip ever decided was
          which of three arrays already in hand to print. `SegmentedPanels` makes
          that choice in the browser and lets the URL follow. */}
      <SegmentedPanels
        /* the key is the SERVER's answer — see /my-classes for why */
        key={show}
        initial={show}
        segments={SHOWS.map(({ k, label, aria }) => ({ key: k, href: k === "participant" ? "/my-events" : `/my-events?show=${k}`, label, aria, n: nOf(k) }))}
        panels={[
          {
            key: "participant",
            node: entries.length ? <>{entries.map((t) => <TicketRow key={t.id} t={t} />)}</> : <Empty>No entries yet. A battle or a tournament you enter — solo, as a duet, or with a crew you lead — appears here.</Empty>,
          },
          {
            key: "spectator",
            node: seats.length ? <>{seats.map((t) => <TicketRow key={t.id} t={t} />)}</> : <Empty>No seats yet. Book a ticket to a showcase or a battle and it appears here, with its code.</Empty>,
          },
          {
            key: "assisting",
            node: assisting.length ? (
              <>
                {assisting.map((ev) => (
                  <div key={ev.id} style={{ marginBottom: 10 }}>
                    <EventCard event={ev} href={`/business/${ev.tenantId}/events/${ev.id}`} />
                  </div>
                ))}
              </>
            ) : (
              <Empty>
                {helpingIds.length ? "The businesses you are on the team of have no events on." : "You are not on any business’s team yet. Once you are, the events it runs appear here, and you can help at the door."}
              </Empty>
            ),
          },
        ]}
      />

      {/* ⚠ THE TOTAL IS GONE (20 Sep 2026, the user: "similar figures need to be
          removed from all pages in the app"). The segment above already carries
          the same count. */}
    </div>
  );
}
