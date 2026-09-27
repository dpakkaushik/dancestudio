"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Portal } from "@/components/ui/Portal";
import { setCrewSocialsAction, updateCrewAction } from "@/features/crews/server-actions/crews";
import { updateTenantProfileAction } from "@/features/settings/server-actions/plans";
import { updateMyProfileAction } from "@/features/profiles/server-actions/profile";
import type { StudioLinkTarget } from "@/features/tenants/components/StudioLinksRow";
import { INK, MUTED, SUB } from "@/lib/design/tokens";
import type { Crew } from "@/types/crew";
import type { Profile, SocialLink } from "@/types/profile";
import { enquiryTypesFor } from "@/types/enquiry";
import { useEditMode } from "./EditMode";
import { linkChip } from "./profile-band";
import { Sheet, fieldInput, fieldLabel, sheetBtn } from "./profile-kit";
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
  | { kind: "business"; tenant: StudioLinkTarget; /** `?edit=1` on the business's own home — where the pin is */ detailsHref: string }
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
  const enquiryTypes = target.kind === "business" ? target.tenant.enquiryTypes : null;
  const [d, setD] = useState({
    phone: (target.kind === "person" ? target.profile.phone : target.kind === "business" ? target.tenant.phone : target.crew.phone) ?? "",
    phonePublic: target.kind === "person" ? target.profile.phonePublic : target.kind === "crew" ? target.crew.phonePublic : true,
    email: (target.kind === "person" ? target.profile.contactEmail : target.kind === "business" ? target.tenant.contactEmail : target.crew.contactEmail) ?? "",
    whatsapp: whatsappBox(socials),
    /* null on the record means every type the kind allows; an empty list means none — no button */
    enquiry: !(Array.isArray(enquiryTypes) && enquiryTypes.length === 0),
    /* the kinds it takes — null on the record is EVERY kind, so the chips open
       all-on, which is what the record means rather than what it literally holds */
    kinds:
      target.kind === "business"
        ? Array.isArray(enquiryTypes) && enquiryTypes.length
          ? enquiryTypes
          : enquiryTypesFor(target.tenant.type).map((t) => t.k)
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
      const all = enquiryTypesFor(target.kind === "business" ? target.tenant.type : "studio").map((t) => t.k);
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
        const t = target.tenant;
        const out = await updateTenantProfileAction({ tenantId: t.id, styles: lists.styles, socials: nextSocials, foundedYear: t.foundedYear, phone, contactEmail: email, accepts: t.accepts, enquiryTypes: enqNext() });
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

  /** the row as the page will draw it, in the page's own order. ⚠ Call obeys
   *  the SWITCH as well as the box, because that is the rule the page keeps —
   *  a number with the switch off reaches nobody, and a chip that lit anyway
   *  would be the preview disagreeing with the thing it previews. */
  const callOn = Boolean(d.phone.trim()) && (!hasSwitch || d.phonePublic);
  const preview: Array<[string, boolean]> = [
    ...(hasEnquiry || (target.kind === "person" && target.isArtist) ? ([["Enquiry", hasEnquiry ? d.enquiry : true] as [string, boolean]]) : []),
    ["Call", callOn],
    ["Mail", Boolean(d.email.trim())],
    ["Message", Boolean(d.whatsapp.trim())],
    ...(target.kind === "business" ? ([["Location", true] as [string, boolean]]) : []),
  ];

  return (
    <Portal>
      <Sheet label="Contact buttons" onClose={onClose} maxHeight="88vh">
        <b style={{ fontSize: 16.5, letterSpacing: -0.2 }}>Contact buttons</b>

        {/* ⚠⚠ THE FORM SHOWS WHAT IT IS BUILDING (27 Sep 2026, the user: *"fix
            add contact buttons form in a better way on all profiles"*).
            It was a flat stack of boxes under one sentence — *"each button is
            drawn while its box is filled"* — which is a rule you have to hold in
            your head while you type, on a sheet whose whole subject is a ROW OF
            BUTTONS you cannot see from it. So the row is here, live: a chip per
            button, lit when it will be drawn and dim when it will not, in the
            order the page draws them. Empty a box and its chip goes out while
            you watch, which is the sentence made unnecessary rather than
            reworded — C4c's rule (*helper text only where the control cannot
            speak*) applied to a control that could speak all along. */}
        <div aria-hidden="true" style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0 2px" }}>
          {preview.map(([label, on]) => (
            <span
              key={label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 11px",
                borderRadius: 999,
                fontSize: 10.5,
                fontWeight: 900,
                background: on ? "var(--text)" : "var(--card)",
                color: on ? "var(--solid)" : MUTED,
                border: `1.5px solid ${on ? "var(--text)" : "var(--el)"}`,
                opacity: on ? 1 : 0.65,
              }}
            >
              {on ? "●" : "○"} {label}
            </span>
          ))}
        </div>
        {/* the one thing the chips cannot say: WHOSE page they land on */}
        <div style={{ fontSize: 10.5, color: MUTED, margin: "6px 0 0" }}>on {who}</div>

        <div style={fieldLabel}>Call · mobile</div>
        <input aria-label="Phone" type="tel" inputMode="tel" value={d.phone} onChange={(e) => setD((x) => ({ ...x, phone: e.target.value }))} placeholder="+91 98765 43210" style={fieldInput} />
        {hasSwitch ? (
          <Switch on={d.phonePublic} label={target.kind === "crew" ? "Show Call on the crew's page" : "Show Call on my profile"} onClick={() => setD((x) => ({ ...x, phonePublic: !x.phonePublic }))} />
        ) : target.kind === "person" ? (
          <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>Kept on your account. A plain user&apos;s page shows no Call; the Artist plan adds the switch.</div>
        ) : null}

        <div style={fieldLabel}>Mail · email</div>
        <input aria-label="Email" type="email" inputMode="email" value={d.email} onChange={(e) => setD((x) => ({ ...x, email: e.target.value }))} placeholder="hello@example.com" style={fieldInput} />

        <div style={fieldLabel}>Message · WhatsApp</div>
        <input aria-label="WhatsApp" type="tel" inputMode="tel" value={d.whatsapp} onChange={(e) => setD((x) => ({ ...x, whatsapp: e.target.value }))} placeholder="+91 98765 43210" style={fieldInput} />

        {/* ⚠⚠ THE ENQUIRY SWITCH AND ITS KINDS LEFT THIS SHEET (27 Sep 2026, the
            user: *"with its setting as well manged from there"*). Enquiries is a
            TOOL with a desk of its own since the same evening, and what you take
            is the first thing that desk is about — so the control moved to it
            and this sheet keeps the row of buttons it is named after.

            ⚠ `d.enquiry` and `d.kinds` STAY, with no control on them, and that
            is deliberate rather than leftover: `update_business_profile` takes
            the WHOLE profile, so a Save here that omitted the kinds would empty
            the column the desk had just set. They are a round-trip carrier now,
            exactly as `accepts` has been since the Payments desk took those
            switches — the 26 Sep rule that a door taking the whole record makes
            every caller a writer of every field. */}
        {hasEnquiry ? <div style={{ fontSize: 10.5, color: MUTED, marginTop: 10 }}>Which kinds of enquiry it takes is set on the Enquiries tool.</div> : null}

        {/* ⚠ LOCATION IS NOT A FIELD HERE AND NEVER WAS (27 Sep 2026). It had a
            `fieldLabel` and a paragraph in place of a control — a heading with
            nothing under it, which reads as a box that failed to render. The pin
            is Edit details' and the chip above says the button is on; what is
            left is the door, one line, where a door belongs. */}
        {target.kind === "business" ? (
          <div style={{ marginTop: 14 }}>
            <Link href={target.detailsHref} scroll={false} style={{ fontSize: 11.5, fontWeight: 900, color: INK, textDecoration: "none" }}>
              The pin on the map is in Edit details ›
            </Link>
          </div>
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
