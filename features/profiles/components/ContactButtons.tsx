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

/** ⚠ THE BOX IS EXPORTED, BECAUSE `EnquiryButton` HAD A BYTE-IDENTICAL COPY OF
 *  IT (28 Sep 2026). Enquiry is a cell of this same row, declared in its own
 *  file because it opens a sheet — and it re-declared the anatomy rather than
 *  importing it, so the two could drift and, on the label fix below, WOULD have:
 *  four buttons would have stopped clipping and the fifth would have gone on
 *  doing it. This repo has paid that bill three times (`linkChip` twice, the
 *  figure row three times), so the literal lives once. */
export const CONTACT_BOX: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 4, height: 38, borderRadius: 11, fontWeight: 800, fontSize: 11, boxSizing: "border-box", padding: "0 4px", overflow: "hidden", whiteSpace: "nowrap", background: CARD, color: INK, border: `1.5px solid ${LINE}`, textDecoration: "none" };
/** ⚠ AND THE WORD SHRINKS BEFORE IT IS CUT. The box is `overflow: hidden` with
 *  `nowrap`, so a label wider than its cell was CHOPPED MID-GLYPH with nothing
 *  to say it had been — which is what "contact buttons getting cut" is. A label
 *  that ellipsises is the floor, not the fix: the fix is `ActionRow` below
 *  giving the cell enough room. This is what happens on a phone narrower than
 *  any this app has measured. */
export const CONTACT_LABEL: CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" };
const box = CONTACT_BOX;
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
      <span style={CONTACT_LABEL}>Call</span>
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
      <span style={CONTACT_LABEL}>Mail</span>
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
      <span style={CONTACT_LABEL}>Message</span>
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
      <span style={CONTACT_LABEL}>Location</span>
    </a>
  );
}

/** As many equal cells as there are acts (10875) — nothing is drawn when there
 *  are none, so a page never carries an empty row.
 *
 *  ⚠⚠ THE DEFAULT IS −6, AND IT IS THE SECOND ANSWER TO THE SAME COMPLAINT.
 *  21 Sep 2026, the user: *"remove gap between social media links and buttons on
 *  home and profile for all"* — the default went from 12 to 0, because every one
 *  of the callers draws this row DIRECTLY AFTER `</IdentityHero>` whose content
 *  sits in `padding: "14px 16px"`, so a `marginTop: 12` was spending the same
 *  space twice and put 26px there.
 *  27 Sep 2026, the same user: *"fix gap between social media links and contact
 *  buttons on all profiles"* — because 0 left the hero's own **14px**, and it was
 *  MEASURED at exactly 14 on a studio's page, an organization's, an artist's and
 *  both own homes (`gap2.js` / `gap3.js`, scratchpad). Consistent, and still
 *  wrong: the band's own last step — the styles row to the links row — is **8px**
 *  (`LINKS_ROW.marginTop`), so the buttons sat nearly twice as far from the links
 *  as the links sit from the styles, and read as a separate block that had
 *  drifted off the bottom of the band rather than as its last row.
 *  ⚠ So the number is not a taste: −6 lands the row at 8px below the links, which
 *  is the rhythm of the row above it. It is negative because the 14 belongs to
 *  the HERO and is right for every page that ends there — reducing the hero's own
 *  padding would move every screen in the app to fix four.
 *  A caller whose row follows something ELSE (a member's "You are on this team"
 *  strip, which is outside the hero and pads nothing) passes its own small
 *  positive value, which is why this is a default rather than a constant. */
/** ⚠⚠ AND IT WRAPS PAST FOUR, WHICH IS WHY THE LABELS WERE BEING CUT (28 Sep
 *  2026, the user: *"contact buttons getting cut on all profiles"*).
 *  The row was `repeat(N, 1fr)` for every N, and a studio's home, an
 *  organization's home and both of their public pages draw FIVE cells — Enquiry
 *  · Call · Mail · Message · Location. Measured rather than argued about: the
 *  hero's content is `430 − 32 = 398px` wide at the app's own `maxWidth`, five
 *  cells with four 6px gaps leave **74.8px each**, and a cell spends 8px on
 *  padding, 14px on its glyph and 4px on the gap before the word — so
 *  **"Location" had ~48px for ~46px of text and "Message" ~46px for ~46px**. At
 *  430 it was a hair; at the 360px phone this app is actually read on the cell
 *  is 60.8px and the word had **34px**, so it was chopped mid-glyph.
 *  ⚠ Four is the ceiling because four is what FITS: at 360px four cells are
 *  77.5px each, which leaves 51px for the longest word in the set. Five never
 *  can, at any type size worth reading, so the row wraps instead — and it wraps
 *  BALANCED (`ceil(N/2)`), so five reads 3 + 2 rather than 4 + 1 with one button
 *  stranded under a full row.
 *  ⚠ The cells stay EQUAL (`1fr`) and the geometry is untouched — 38px tall,
 *  11px type, radius 11 (the prototype's own 10875-10888). What changed is how
 *  many of them share a line. */
/** ⚠⚠ AND IT IS `position: relative`, WHICH IS WHAT MAKES THE −6 ABOVE VISIBLE
 *  RATHER THAN DESTRUCTIVE (28 Sep 2026, the user: *"the top part of contact
 *  buttons getting cut on home and profile"*).
 *  `IdentityHero` is `position: relative` with an opaque background, this row is
 *  its next SIBLING, and a positioned element paints ABOVE a later static one
 *  whatever the DOM order says — so the hero's last 6px of wash was painted over
 *  the top 6px of every button: its top border and both top corners, on all
 *  eight surfaces that draw this row, from the day the margin went negative.
 *  ⚠ MEASURED, because a rect cannot see it: `getBoundingClientRect` reported a
 *  perfectly correct 38px box 8px below the links — which is why the 27 Sep
 *  "re-measured at 8px" was true and the screen still read 14 with the buttons
 *  clipped. `document.elementFromPoint` at each button's own top edge is the
 *  question a rect cannot answer, and it named the hero on home and profile at
 *  430 AND 360, with the button's first own pixel 6px down.
 *  ⚠⚠ AND DELIBERATELY NO `zIndex`. Positioned + `z-index: auto` creates NO
 *  stacking context, so tree order alone puts this row over the hero and nothing
 *  else moves. A `zIndex: 1` here would WORK and would also make this row a
 *  stacking context — and `EnquirySheet` is a cell of it that renders its own
 *  `position: fixed` scrim at 930 IN PLACE, unportalled, so that sheet would be
 *  trapped inside a 38px row. That is the 16 Sep lesson this repo has now paid
 *  for four times: z-index is only comparable inside ONE stacking context. */
export function ActionRow({ children, gap = 6, marginTop = -6 }: { children: ReactNode; gap?: number; marginTop?: number }) {
  /* `Children.toArray` drops the nulls a `cond ? <X/> : null` leaves behind */
  const cells = Children.toArray(children);
  if (cells.length === 0) return null;
  const cols = cells.length <= 4 ? cells.length : Math.ceil(cells.length / 2);
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap, marginTop, position: "relative" }}>{cells}</div>;
}
