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

function Switch({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
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
    /* an enquiry switched off is an EMPTY list of accepted types; switched back
       on it is "every type" (null) unless a narrower list was kept in Settings */
    const enqNext = (was: string[] | null): string[] | null => (d.enquiry ? (Array.isArray(was) && was.length ? was : null) : []);
    start(async () => {
      setErr(null);
      let error: string | null = null;
      if (target.kind === "person") {
        const p = target.profile;
        const out = await updateMyProfileAction({ fullName: p.fullName, city: (p.city ?? "").trim(), age: p.age, socials: nextSocials, styles: lists.styles, phone, contactEmail: email, phonePublic: target.isArtist ? d.phonePublic : undefined });
        error = out.error;
      } else if (target.kind === "business") {
        const t = target.tenant;
        const out = await updateTenantProfileAction({ tenantId: t.id, styles: lists.styles, socials: nextSocials, foundedYear: t.foundedYear, phone, contactEmail: email, accepts: t.accepts, enquiryTypes: enqNext(t.enquiryTypes) });
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

  return (
    <Portal>
      <Sheet label="Contact buttons" onClose={onClose} maxHeight="88vh">
        <b style={{ fontSize: 16.5, letterSpacing: -0.2 }}>Contact buttons</b>
        <div style={{ fontSize: 11.5, color: SUB, marginTop: 4, lineHeight: 1.45 }}>Each button is drawn while its box is filled — empty a box to take the button off {who}.</div>

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
        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>Opens a WhatsApp chat. It is also a chip in the links row.</div>

        {hasEnquiry ? (
          <>
            <div style={fieldLabel}>Enquiry</div>
            <Switch on={d.enquiry} label="Take enquiries" onClick={() => setD((x) => ({ ...x, enquiry: !x.enquiry }))} />
            <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>Which kinds you take is Settings › Enquiry types.</div>
          </>
        ) : target.kind === "person" && target.isArtist ? (
          <>
            <div style={fieldLabel}>Enquiry</div>
            <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.45 }}>Enquiries reach your artist page — which kinds, or none, is Settings › Enquiry types.</div>
          </>
        ) : null}

        <div style={fieldLabel}>Location</div>
        <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.45 }}>
          {target.kind === "business" ? (
            <>
              The pin on the map, from{" "}
              <Link href={target.detailsHref} scroll={false} style={{ color: INK, fontWeight: 800 }}>
                Edit details
              </Link>
              .
            </>
          ) : target.kind === "person" ? (
            "Your city, from Edit details. A person's page carries no map."
          ) : (
            "The crew's city, from Edit details."
          )}
        </div>

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
