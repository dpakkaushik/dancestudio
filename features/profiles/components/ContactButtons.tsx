import { Children, type CSSProperties, type ReactNode } from "react";
import { CARD, INK, LINE, SUB } from "@/lib/design/tokens";
import { mapsHref } from "./profile-kit";

/** THE SMALL BUTTONS UNDER THE BIO (19 Sep 2026, the user's list, page by page:
 *  "Send Enquiry for all except users, Call for studios and organizations, Mail
 *  for all except users, Location for only Studio and Organizations"). The
 *  prototype's small action row (10875-10888): 38px tall, 11px type, as many
 *  equal cells as there are acts. Each one is a real hand-off — `tel:`,
 *  `mailto:`, a Maps link — drawn only when there is a number, an address or a
 *  place to hand off to. Enquiry keeps its own island (`EnquiryButton`) because
 *  it opens a sheet. */

const box: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 4, height: 38, borderRadius: 11, fontWeight: 800, fontSize: 11, boxSizing: "border-box", padding: "0 4px", overflow: "hidden", whiteSpace: "nowrap", background: CARD, color: INK, border: `1.5px solid ${LINE}`, textDecoration: "none" };
const glyph: CSSProperties = { flexShrink: 0, lineHeight: 0, color: SUB };

/** Call — a real tel: hand-off to the number on record (10879); drawn only when
 *  there is one. One Call for a studio and an organization alike. */
export function CallButton({ phone }: { phone: string }) {
  return (
    <a href={`tel:${phone.replace(/\s+/g, "")}`} aria-label="Call" style={box}>
      <span style={glyph}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6.6 3.6c.5-.5 1.4-.4 1.8.2l1.5 2.1c.4.5.3 1.2-.1 1.7l-.9 1c-.2.3-.3.8-.1 1.1a11 11 0 0 0 3 3c.3.2.8.2 1.1-.1l1-.9c.5-.4 1.2-.5 1.7-.1l2.1 1.5c.6.4.7 1.3.2 1.8l-1 1c-.6.6-1.4.8-2.2.6a15.6 15.6 0 0 1-6.8-4.1 15.6 15.6 0 0 1-4.1-6.8c-.2-.8 0-1.6.6-2.2z" />
        </svg>
      </span>
      Call
    </a>
  );
}

/** Mail — a mailto: to the contact email the owner published (19 Sep 2026). */
export function MailButton({ email }: { email: string }) {
  return (
    <a href={`mailto:${email.trim()}`} aria-label="Mail" style={box}>
      <span style={glyph}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
          <path d="m3.5 7 8.5 6 8.5-6" />
        </svg>
      </span>
      Mail
    </a>
  );
}

/** MESSAGE — a WhatsApp hand-off (26 Sep 2026, the user's list of buttons on a
 *  home: "email, location, phone, message, enquiry"; and their answer that
 *  Message is a WhatsApp number). The number lives where every other link
 *  does — the `socials` list, platform "WhatsApp", as a `wa.me` address — so a
 *  profile that already pasted one on 29 Aug draws the button today with no
 *  migration. `whatsappHrefOf` is the one reading of that entry. */
export const whatsappHrefOf = (socials: Array<{ platform: string; url: string }> | null | undefined): string | null => {
  const l = (socials ?? []).find((s) => s.platform === "WhatsApp");
  if (!l) return null;
  const s = String(l.url ?? "").trim();
  return /^https?:\/\/[^\s]+$/i.test(s) ? s : null;
};
export function MessageButton({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label="Message" style={box}>
      <span style={glyph}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 6h16v10H9l-5 4z" />
          <path d="M8 10h8M8 13h5" />
        </svg>
      </span>
      Message
    </a>
  );
}

/** Location — opens the place in Maps. THE PIN WHEN THERE IS ONE (19 Sep 2026,
 *  the user: "locations should be the google map link for the particular
 *  organization and studio"): a studio that has placed itself hands its own
 *  Maps link (`href`); one that has not, and an organization, fall back to Maps
 *  by name and place (`query`, the URL dosOpenMaps 206 builds). */
export const mapsPinHref = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
export function LocationButton({ query, href }: { query?: string; href?: string }) {
  return (
    <a href={href ?? mapsHref(query ?? "")} target="_blank" rel="noreferrer" aria-label="Location" style={box}>
      <span style={glyph}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 21s-6.5-5.7-6.5-10A6.5 6.5 0 0 1 12 4.5 6.5 6.5 0 0 1 18.5 11c0 4.3-6.5 10-6.5 10z" />
          <circle cx="12" cy="10.8" r="2.3" />
        </svg>
      </span>
      Location
    </a>
  );
}

/** As many equal cells as there are acts (10875) — nothing is drawn when there
 *  are none, so a page never carries an empty row.
 *
 *  ⚠ THE DEFAULT GAP IS 0, AND THAT IS THE ANSWER TO A REAL COMPLAINT (21 Sep
 *  2026, the user: "remove gap between social media links and buttons on home
 *  and profile for all"). Every one of the eight callers draws this row
 *  DIRECTLY AFTER `</IdentityHero>`, and the hero's own content sits in
 *  `padding: "14px 16px"` — so a `marginTop: 12` here put **26px** between the
 *  links row and the buttons where the band's own rows sit 12 apart. The 14 the
 *  hero already spends is the gap; anything this row adds is the gap twice.
 *  A caller whose row follows something ELSE (a member's "You are on this
 *  team" strip) passes its own small value, which is why this is a default
 *  rather than a constant. */
export function ActionRow({ children, gap = 6, marginTop = 0 }: { children: ReactNode; gap?: number; marginTop?: number }) {
  /* `Children.toArray` drops the nulls a `cond ? <X/> : null` leaves behind */
  const cells = Children.toArray(children);
  if (cells.length === 0) return null;
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(${cells.length}, 1fr)`, gap, marginTop }}>{cells}</div>;
}
