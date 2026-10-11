/** The `.ics` grammar, written once (12 Oct 2026). The single class's file
 *  (`/c/{slug}/ics`) and the whole calendar's feed (`/api/calendar/…`) both
 *  build their lines here, so the two cannot come to disagree about escaping,
 *  folding or what a time looks like. RFC 5545. */

/** a UTC instant as `YYYYMMDDTHHMMSSZ` — every calendar app converts it back */
export const icsStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** commas, semicolons and backslashes are escaped, newlines are \n */
export const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** a content line is folded at 75 octets (approximated by characters) */
export const icsFold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join("\r\n");
};

export interface IcsEvent {
  uid: string;
  startsAt: string;
  endsAt: string;
  title: string;
  location?: string;
  description?: string;
  url?: string;
  /** minutes before the start for a reminder; none when omitted */
  alarmMinutes?: number;
  cancelled?: boolean;
}

export function icsCalendar(events: IcsEvent[], name?: string): string {
  const now = icsStamp(new Date().toISOString());
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DanceOS//Classes//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  if (name) {
    lines.push(`X-WR-CALNAME:${icsEscape(name)}`, "X-WR-TIMEZONE:Asia/Kolkata", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H");
  }
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${now}`, `DTSTART:${icsStamp(e.startsAt)}`, `DTEND:${icsStamp(e.endsAt)}`, `SUMMARY:${icsEscape(e.title)}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.cancelled) lines.push("STATUS:CANCELLED");
    if (e.alarmMinutes && !e.cancelled) {
      lines.push("BEGIN:VALARM", `TRIGGER:-PT${e.alarmMinutes}M`, "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(e.title)}`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
