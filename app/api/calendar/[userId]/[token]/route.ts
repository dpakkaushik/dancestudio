import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { calendarFeedTokenOk } from "@/lib/calendar/feedToken";
import { icsCalendar, type IcsEvent } from "@/lib/calendar/ics";
import { findMyCalendar } from "@/repositories/calendar";

/** THE WHOLE CALENDAR AS ONE SUBSCRIBABLE FEED (12 Oct 2026, the user: "add to
 *  calendar not on individual class cards but the entire calendar sync from the
 *  calendar page").
 *
 *  A calendar app (Google, Apple, Outlook) fetches this URL every hour or so with
 *  no session, so the URL carries its own proof — `calendarFeedTokenOk` — and the
 *  rows are read with the SERVICE ROLE, scoped to that one person by id out
 *  loud: `findMyCalendar` filters `user_id = …` on both of its reads (classes
 *  booked, taught or assisted), and the practices are read through the crews
 *  they are CONFIRMED on. A wrong token is a 404, never a hint that the person
 *  exists. ⚠ What goes out is exactly what that person's own calendar draws:
 *  their classes and their crews' practices, nothing about anybody else. */

const MONTHS_BACK = 1;
const MONTHS_AHEAD = 6;
const UUID = /^[0-9a-f-]{36}$/;

export async function GET(request: Request, { params }: { params: Promise<{ userId: string; token: string }> }) {
  const { userId, token: raw } = await params;
  const token = raw.replace(/\.ics$/, "");
  if (!UUID.test(userId) || !calendarFeedTokenOk(userId, token)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - MONTHS_BACK, 1)).toISOString();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + MONTHS_AHEAD + 1, 1)).toISOString();

  const [classes, practices] = await Promise.all([
    findMyCalendar(admin, userId, from, to).catch(() => []),
    readPractices(admin, userId, from, to).catch(() => [] as IcsEvent[]),
  ]);

  const origin = new URL(request.url).origin;
  const SIDE_WORD = { attending: "Booked", hosting: "Teaching", assisting: "Assisting" } as const;
  const events: IcsEvent[] = [
    ...classes
      .filter((e) => e.classStatus !== "draft")
      .map<IcsEvent>((e) => ({
        uid: `${e.sessionId}@danceos`,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        title: `${e.title} · ${SIDE_WORD[e.side] ?? "Class"}`,
        location: [e.room, e.venue?.name ?? e.businessName, e.businessCity].filter(Boolean).join(", "),
        description: `${SIDE_WORD[e.side] ?? "Class"} on DanceOS\n${origin}/c/${e.shareSlug}`,
        url: `${origin}/c/${e.shareSlug}`,
        alarmMinutes: 120,
      })),
    ...practices,
  ];

  return new NextResponse(icsCalendar(events, "DanceOS"), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="danceos.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}

/** the practices of every crew this person is CONFIRMED on — the same set
 *  `my_crew_practices` answers for them signed in, read here by id because a
 *  feed has no session to scope a definer read with */
async function readPractices(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string, from: string, to: string): Promise<IcsEvent[]> {
  const { data: seats } = await admin.from("crew_members").select("crew_id").eq("user_id", userId).eq("status", "confirmed").is("deleted_at", null);
  const crewIds = [...new Set(((seats ?? []) as Array<{ crew_id: string }>).map((s) => s.crew_id))];
  if (!crewIds.length) return [];
  const { data, error } = await admin
    .from("crew_practices")
    .select("id, starts_at, ends_at, place, note, status, crews!inner (name, deleted_at)")
    .in("crew_id", crewIds)
    .is("deleted_at", null)
    .is("crews.deleted_at", null)
    .gte("starts_at", from)
    .lt("starts_at", to)
    .limit(500);
  if (error) throw new Error(error.message);
  type Row = { id: string; starts_at: string; ends_at: string; place: string | null; note: string | null; status: string; crews: { name: string } | null };
  return ((data ?? []) as unknown as Row[]).map((p) => ({
    uid: `practice-${p.id}@danceos`,
    startsAt: p.starts_at,
    endsAt: p.ends_at,
    title: `${p.crews?.name ?? "Crew"} · Practice`,
    location: p.place ?? undefined,
    description: p.note ?? undefined,
    alarmMinutes: 120,
    cancelled: p.status === "cancelled",
  }));
}
