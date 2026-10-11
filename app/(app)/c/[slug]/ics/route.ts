import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findClassBySlug } from "@/repositories/classes";

/** ADD TO CALENDAR (11 Oct 2026, D11): the class as one `.ics` event, so a
 *  booked seat lands in the person's own calendar app. Read under the caller's
 *  own RLS — a class they cannot read is a 404, exactly as its page is. The
 *  times go out in UTC (`Z`), which every calendar converts back to the reader's
 *  zone; the class is held in India, so the description says IST in words. */

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/* RFC 5545: commas, semicolons and backslashes are escaped, newlines are \n */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/* a content line is folded at 75 octets (approximated by characters) */
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join("\r\n");
};

const IST_TIME = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const c = await findClassBySlug(supabase, slug).catch(() => null);
  if (!c || !c.session) {
    return new NextResponse("Not found", { status: 404 });
  }
  const atVenue = c.venueStatus === "accepted" && c.venueName;
  const placeName = atVenue ? c.venueName! : c.businessName;
  const area = atVenue ? [c.venueArea, c.venueCity] : [c.businessArea, c.businessCity];
  const location = [c.room, placeName, ...area].filter(Boolean).join(", ");
  const url = new URL(`/c/${c.shareSlug}`, request.url).toString();
  const description = [`${c.title} at ${placeName}`, `Starts ${IST_TIME.format(new Date(c.session.startsAt))} IST`, url].join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DanceOS//Classes//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${c.session.id}@danceos`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(c.session.startsAt)}`,
    `DTEND:${stamp(c.session.endsAt)}`,
    `SUMMARY:${esc(c.title)}`,
    `LOCATION:${esc(location)}`,
    `DESCRIPTION:${esc(description)}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(c.title)} in 2 hours`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return new NextResponse(lines.map(fold).join("\r\n") + "\r\n", {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${c.shareSlug}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
