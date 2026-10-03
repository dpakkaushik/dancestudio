"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { Portal } from "@/components/ui/Portal";
import { setCrewSocialsAction, updateCrewAction } from "@/features/crews/server-actions/crews";
import { updateBusinessProfileAction } from "@/features/settings/server-actions/plans";
import { updateMyProfileAction } from "@/features/profiles/server-actions/profile";
import type { StudioLinkTarget } from "@/features/businesses/components/StudioLinksRow";
import { INK, MUTED, SUB } from "@/lib/design/tokens";
import type { Crew } from "@/types/crew";
import type { Profile, SocialLink } from "@/types/profile";
import { enquiryTypesFor } from "@/types/enquiry";
import { ContactGlyph, type ContactKind } from "./ContactButtons";
import { useEditMode } from "./EditMode";
import { linkChip } from "./profile-band";
import { Sheet, fieldInput, sheetBtn } from "./profile-kit";
import { useRecordLists } from "./RecordLists";

/** THE CONTACT BUTTONS, EDITED WHERE THEY ARE DRAWN (26 Sep 2026).
 *
 *  The user: *"all buttons like email, location, phone, message, enquiry on
 *  home tab should also be like social media and dance style edit style to add
 *  or remove and those options can be removed from edit profile."*
 *
 *  So a home's button row has a ⊕ beside it while the pencil is pressed, the
 *  way the styles and the links rows do, and it opens ONE sheet holding what
 *  each button is made of: the number Call dials (and, for an artist and a
 *  crew, the switch that shows it), the address Mail opens, the WhatsApp
 *  number Message opens, whether Enquiry is offered at all. Emptying a field
 *  REMOVES its button — that is what "add or remove" means for a button whose
 *  whole existence is a field. Location is the one exception: a place is the
 *  details sheet's map, and the row says so rather than drawing a second map.
 *
 *  ⚠ THREE DOORS, ONE SHEET. A person's fields land through `update_my_profile`,
 *  a business's through `update_business_profile` (the WHOLE profile, so every
 *  field it is not editing rides through unchanged — the 16 Sep rule), a crew's
 *  through `update_crew` and `set_crew_socials`. The sheet knows which by the
 *  target it is handed and nothing else.
 *
 *  ⚠ WHATSAPP IS A LINK, NOT A COLUMN. Message is the `socials` entry whose
 *  platform is "WhatsApp", as a `wa.me` address — the list every profile has
 *  carried since 29 Aug — so no schema moved for it, and the links row shows
 *  the same chip. A typed number becomes `https://wa.me/<digits>`. */
export type ContactTarget =
  | {
      kind: "person";
      profile: Profile;
      /** a live plan — the Call switch is an artist's, and a plain user's page draws no buttons */
      isArtist: boolean;
    }
  | { kind: "business"; business: StudioLinkTarget; /** `?edit=1` on the business's own home — where the pin is */ detailsHref: string }
  | { kind: "crew"; crew: Crew; socials: SocialLink[] };

const WA = "WhatsApp";
const digitsOf = (s: string) => s.replace(/[^0-9]/g, "");
/** what the WhatsApp entry reads as in the box: the digits of a wa.me link, or the raw address */
const whatsappBox = (socials: SocialLink[]): string => {
  const l = socials.find((s) => s.platform === WA);
  if (!l) return "";
  const m = /wa\.me\/(\d+)/i.exec(l.url);
  return m ? `+${m[1]}` : l.url;
};
/** the list with the WhatsApp entry set from the box, or removed when it is empty */
const withWhatsapp = (socials: SocialLink[], box: string): SocialLink[] | string => {
  const rest = socials.filter((s) => s.platform !== WA);
  const v = box.trim();
  if (!v) return rest;
  if (/^https?:\/\//i.test(v)) return [...rest, { platform: WA, url: v }];
  const d = digitsOf(v);
  if (d.length < 8 || d.length > 15) return "A WhatsApp number is 8 to 15 digits, with the country code";
  return [...rest, { platform: WA, url: `https://wa.me/${d}` }];
};

/** ⚠ EXPORTED SINCE 27 Sep 2026 so the Enquiries desk's settings wear the SAME
 *  switch rather than a second one three pixels different — this repo has paid
 *  for a copied control four times (`linkChip` twice, the figure row three
 *  times, three copies of the identity band, a toast declared inline). */
export function Switch({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 0 2px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--text)", textAlign: "left" }}>
      <span style={{ flex: 1, fontSize: 12, fontWeight: 800 }}>{label}</span>
      <span aria-hidden="true" style={{ width: 42, height: 24, borderRadius: 12, flexShrink: 0, background: on ? "#22C55E" : "var(--el)", position: "relative", display: "inline-block" }}>
        <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .15s" }} />
      </span>
    </button>
  );
}

const cardInput: CSSProperties = { ...fieldInput, marginTop: 9 };

/** ONE BUTTON, ONE CARD (3 Oct 2026) — the mark the page draws on the button, its
 *  name, whether it is on the page right now (with the reason when a filled box
 *  is still not shown), its own Remove, and the box it is made of under that.
 *  The card's edge is the theme's ink while the button is live, so the cards
 *  that make buttons read apart from the ones that do not at a glance. */
function ButtonCard({
  kind,
  name,
  on,
  why = null,
  onRemove,
  children,
}: {
  kind: ContactKind;
  name: string;
  on: boolean;
  why?: string | null;
  onRemove?: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      data-testid={`contact-card-${kind}`}
      style={{ marginTop: 10, padding: "11px 12px 12px", borderRadius: 14, background: "var(--card)", border: `1.5px solid ${on ? "var(--text)" : "var(--el)"}` }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span
          aria-hidden="true"
          style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: on ? "var(--text)" : "var(--el)", color: on ? "var(--solid)" : SUB }}
        >
          <ContactGlyph kind={kind} size={15} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 900, color: INK }}>{name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 800, color: SUB, marginTop: 1 }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, flexShrink: 0, background: on ? "#22C55E" : "var(--el)" }} />
            {on ? "Shown on the page" : why ?? "Not shown"}
          </div>
        </div>
        {onRemove ? (
          <button
            type="button"
            aria-label={`Remove ${name}`}
            onClick={onRemove}
            style={{ flexShrink: 0, height: 30, padding: "0 11px", borderRadius: 999, border: "1.5px solid var(--el)", background: "transparent", color: SUB, fontSize: 11, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}
          >
            Remove
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function ContactEditButton({ target }: { target: ContactTarget }) {
  const { editing } = useEditMode();
  const [open, setOpen] = useState(false);
  if (!editing) return null;
  return (
    <>
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          aria-label="Edit contact buttons"
          onClick={() => setOpen(true)}
          style={{ ...linkChip, background: "transparent", border: "1px dashed var(--el)", fontSize: 12, fontWeight: 800, color: SUB }}
        >
          ＋ Contact buttons
        </button>
      </div>
      {open ? <ContactSheet target={target} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ContactSheet({ target, onClose }: { target: ContactTarget; onClose: () => void }) {
  const router = useRouter();
  /* ⚠ THE HOME'S LISTS, NOT THE TARGET'S PROPS (`RecordLists`, 26 Sep 2026): a
     style or a link saved on the band a moment ago is here already, and what
     this sheet writes is adopted there, so the band's chips move without a
     remount and neither editor writes a stale list over the other's. */
  const { lists, adopt } = useRecordLists();
  const socials: SocialLink[] = lists.socials;
  const enquiryTypes = target.kind === "business" ? target.business.enquiryTypes : null;
  const [d, setD] = useState({
    phone: (target.kind === "person" ? target.profile.phone : target.kind === "business" ? target.business.phone : target.crew.phone) ?? "",
    phonePublic: target.kind === "person" ? target.profile.phonePublic : target.kind === "crew" ? target.crew.phonePublic : true,
    email: (target.kind === "person" ? target.profile.contactEmail : target.kind === "business" ? target.business.contactEmail : target.crew.contactEmail) ?? "",
    whatsapp: whatsappBox(socials),
    /* null on the record means every type the kind allows; an empty list means none — no button */
    enquiry: !(Array.isArray(enquiryTypes) && enquiryTypes.length === 0),
    /* the kinds it takes — null on the record is EVERY kind, so the chips open
       all-on, which is what the record means rather than what it literally holds */
    kinds:
      target.kind === "business"
        ? Array.isArray(enquiryTypes) && enquiryTypes.length
          ? enquiryTypes
          : enquiryTypesFor(target.business.type).map((t) => t.k)
        : ([] as string[]),
  });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /* ⚠ a BUSINESS's Enquiry is switched here; an artist's enquiries land on their
     artist PAGE (R24), whose kinds are Settings › Enquiry types — every kind off
     there takes the button off their page too */
  const hasEnquiry = target.kind === "business";
  const hasSwitch = (target.kind === "person" && target.isArtist) || target.kind === "crew";

  const save = () => {
    const nextSocials = withWhatsapp(socials, d.whatsapp);
    if (typeof nextSocials === "string") return setErr(nextSocials);
    const phone = d.phone.trim() || null;
    const email = d.email.trim() || null;
    /** ⚠⚠ THE KINDS ARE HERE NOW, NOT IN SETTINGS (27 Sep 2026, the user:
     *  *"enquiries should be removed from settings"*). Which kinds a business
     *  takes is what its Enquiry BUTTON offers, so it belongs beside the switch
     *  that draws the button, not two screens away under MONEY — and having it
     *  in both places was the two-doors-to-one-subject shape this file has
     *  recorded the cost of three times.
     *  ⚠ NULL AND A FULL LIST ARE THE SAME ANSWER and the column's own rule:
     *  null means "every kind this type allows", so a business that ticks them
     *  all is stored as null rather than as a list that would silently stop
     *  growing the day a sixth kind is added. Off is an EMPTY list — no button. */
    const enqNext = (): string[] | null => {
      if (!d.enquiry) return [];
      const all = enquiryTypesFor(target.kind === "business" ? target.business.type : "studio").map((t) => t.k);
      const picked = all.filter((k) => d.kinds.includes(k));
      return picked.length === 0 || picked.length === all.length ? null : picked;
    };
    start(async () => {
      setErr(null);
      let error: string | null = null;
      if (target.kind === "person") {
        const p = target.profile;
        const out = await updateMyProfileAction({ fullName: p.fullName, city: (p.city ?? "").trim(), age: p.age, socials: nextSocials, styles: lists.styles, phone, contactEmail: email, phonePublic: target.isArtist ? d.phonePublic : undefined });
        error = out.error;
      } else if (target.kind === "business") {
        const t = target.business;
        const out = await updateBusinessProfileAction({ businessId: t.id, styles: lists.styles, socials: nextSocials, foundedYear: t.foundedYear, phone, contactEmail: email, accepts: t.accepts, enquiryTypes: enqNext() });
        error = out.error;
      } else {
        const c = target.crew;
        const out = await updateCrewAction({ crewId: c.id, name: c.name, city: c.city, style: c.style, contactEmail: email, phone, phonePublic: d.phonePublic });
        error = out.error;
        if (!error && JSON.stringify(nextSocials) !== JSON.stringify(socials)) {
          const out2 = await setCrewSocialsAction({ crewId: c.id, socials: nextSocials });
          error = out2.error;
        }
      }
      if (error) {
        setErr(error);
        return;
      }
      adopt({ ...lists, socials: nextSocials });
      onClose();
      router.refresh();
    });
  };

  const who = target.kind === "person" ? "your page" : target.kind === "business" ? "its page" : "the crew's page";
  /** a plain user's page draws no buttons at all (the 19 Sep list) — the boxes
   *  still keep the details on the account, and every card says so */
  const pageShows = target.kind !== "person" || target.isArtist;
  /* ⚠ Call obeys the SWITCH as well as the box, because that is the rule the
     page keeps — a number with the switch off reaches nobody */
  const callOn = pageShows && Boolean(d.phone.trim()) && (!hasSwitch || d.phonePublic);
  /* ⚠ enquiries are set in the Inbox's Enquiries column since 2 Oct 2026 (C93,
     C108) — "the Enquiries tool" this sheet used to name no longer exists */
  const enquiryHref = target.kind === "business" ? `/business/${target.business.id}/inbox?show=enquiries` : "/inbox?show=enquiries";

  return (
    <Portal>
      <Sheet label="Contact buttons" onClose={onClose} maxHeight="88vh">
        <b style={{ fontSize: 16.5, letterSpacing: -0.2 }}>Contact buttons</b>
        <div style={{ fontSize: 11, color: MUTED, margin: "3px 0 4px" }}>
          {pageShows ? `The buttons on ${who}, in the order they are drawn` : "Kept on your account — a user's page shows no buttons; the Artist plan does"}
        </div>

        {/* ⚠⚠ A CARD PER BUTTON (3 Oct 2026, the user: "better add contact button
            form can be managed better"). It was a row of preview chips over a
            flat stack of boxes, so what you were editing and what it made were
            two separate lists you matched by eye. Now each button is ONE card in
            the order the page draws it — its own mark, whether it is on the page
            right now, the box it is made of, and its own Remove — which is how
            the styles and links editors already read: a list of things you have,
            each one yours to change or take off. ⚠ Every box stays drawn, filled
            or not, because filling an empty box IS how a button is added. */}
        {(hasEnquiry || (target.kind === "person" && target.isArtist)) ? (
          <ButtonCard kind="enquiry" name="Enquiry" on={hasEnquiry ? d.enquiry : true}>
            <Link href={enquiryHref} style={{ display: "inline-block", marginTop: 8, fontSize: 11.5, fontWeight: 900, color: INK, textDecoration: "none" }}>
              Which kinds you take · Inbox › Enquiries ›
            </Link>
          </ButtonCard>
        ) : null}

        <ButtonCard kind="call" name="Call" on={callOn} why={!pageShows ? null : d.phone.trim() && hasSwitch && !d.phonePublic ? "Hidden — the switch below is off" : null} onRemove={d.phone.trim() ? () => setD((x) => ({ ...x, phone: "" })) : undefined}>
          <input aria-label="Phone" type="tel" inputMode="tel" value={d.phone} onChange={(e) => setD((x) => ({ ...x, phone: e.target.value }))} placeholder="Mobile number, e.g. +91 98765 43210" style={cardInput} />
          {hasSwitch ? (
            <Switch on={d.phonePublic} label={target.kind === "crew" ? "Show Call on the crew's page" : "Show Call on my profile"} onClick={() => setD((x) => ({ ...x, phonePublic: !x.phonePublic }))} />
          ) : null}
        </ButtonCard>

        <ButtonCard kind="mail" name="Mail" on={pageShows && Boolean(d.email.trim())} onRemove={d.email.trim() ? () => setD((x) => ({ ...x, email: "" })) : undefined}>
          <input aria-label="Email" type="email" inputMode="email" value={d.email} onChange={(e) => setD((x) => ({ ...x, email: e.target.value }))} placeholder="Email address" style={cardInput} />
        </ButtonCard>

        <ButtonCard kind="message" name="Message" on={pageShows && Boolean(d.whatsapp.trim())} onRemove={d.whatsapp.trim() ? () => setD((x) => ({ ...x, whatsapp: "" })) : undefined}>
          <input aria-label="WhatsApp" type="tel" inputMode="tel" value={d.whatsapp} onChange={(e) => setD((x) => ({ ...x, whatsapp: e.target.value }))} placeholder="WhatsApp number with country code" style={cardInput} />
        </ButtonCard>

        {/* ⚠ `d.enquiry` and `d.kinds` carry NO control here and still ride every
            Save (27 Sep 2026): `update_business_profile` takes the WHOLE profile,
            so leaving them out would empty the column the Inbox had just set. */}

        {/* LOCATION IS THE PIN, which is Edit details' map — the card says the
            button is on and is the door to where it is changed */}
        {target.kind === "business" ? (
          <ButtonCard kind="location" name="Location" on>
            <Link href={target.detailsHref} scroll={false} style={{ display: "inline-block", marginTop: 8, fontSize: 11.5, fontWeight: 900, color: INK, textDecoration: "none" }}>
              Move the pin · Edit details ›
            </Link>
          </ButtonCard>
        ) : null}

        {err ? <div role="alert" style={{ fontSize: 12, color: "#F87171", marginTop: 10 }}>{err}</div> : null}
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onClose} style={sheetBtn(false)}>Cancel</button>
          <button type="button" disabled={pending} onClick={save} style={sheetBtn(true)}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </Sheet>
    </Portal>
  );
}
