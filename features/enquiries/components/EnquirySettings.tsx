"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/features/profiles/components/ContactEditor";
import { fieldLabel } from "@/features/profiles/components/profile-kit";
import { updateBusinessProfileAction } from "@/features/settings/server-actions/plans";
import { MUTED, SUB } from "@/lib/design/tokens";
import { enquiryTypesFor } from "@/types/enquiry";
import type { Business } from "@/types/business";

/** ⚠⚠ THE ENQUIRY SETTINGS LIVE ON THE ENQUIRIES DESK (27 Sep 2026, the user:
 *  *"enquiries should not be on navbar a tab in tools for all"*, and then *"with
 *  its setting as well manged from there"*).
 *
 *  They were chips under a Take-enquiries switch inside the contact ⊕ on the
 *  home, which was right while Enquiries was a BUTTON somebody makes and unmakes
 *  — the ⊕ is where the button row is built. It is a TOOL now, with a desk of
 *  its own, and what you take is the first thing that desk is about: which kinds
 *  of work you are open to. So the switch and the kinds moved with it, and the
 *  ⊕ keeps only the row of buttons it draws.
 *
 *  ⚠ THE DOOR TAKES THE WHOLE PROFILE (`update_business_profile`), so this sends
 *  every field back unchanged beside the one it moves. That is the 26 Sep lesson
 *  said out loud — *a door that takes the whole record makes every caller a
 *  writer of every field* — and it is why `styles`, `socials`, `accepts`, the
 *  phone and the email are threaded through here untouched: omitting one would
 *  EMPTY a column the RPC then refuses (a studio may not end up with no style).
 *
 *  ⚠ A CREW HAS NO SETTINGS HERE AND THAT IS A FACT, NOT A GAP: `send_enquiry`
 *  fixes a crew's three kinds — celebration, corporate, collaboration — and
 *  `crews` carries no `enquiry_types` column at all. The desk says so in one
 *  line rather than drawing an empty block, which is this file's own rule about
 *  a heading with nothing under it. */
export function EnquirySettings({ businesses }: { businesses: Business[] }) {
  if (businesses.length === 0) return null;
  return (
    <div style={{ margin: "0 0 14px" }}>
      {businesses.map((t) => (
        <OneBusiness key={t.id} business={t} showName={businesses.length > 1} />
      ))}
    </div>
  );
}

function OneBusiness({ business, showName }: { business: Business; showName: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const all = enquiryTypesFor(business.type).map((t) => t.k);
  const stored = business.enquiryTypes;
  /* null on the record means EVERY kind its type allows; an empty list means
     none, and no button on its page. The control opens on what the record
     MEANS rather than on what it literally holds. */
  const [on, setOn] = useState(!(Array.isArray(stored) && stored.length === 0));
  const [kinds, setKinds] = useState<string[]>(Array.isArray(stored) && stored.length ? stored : all);

  /* [] = take none · null = take every kind this type allows · a list = those.
     ⚠ Saving the full list as `null` is what keeps a business open to a SIXTH
     kind the day one is added, instead of freezing today's five onto its row. */
  const next = (takes: boolean, picked: string[]): string[] | null => {
    if (!takes) return [];
    const keep = all.filter((k) => picked.includes(k));
    return keep.length === 0 || keep.length === all.length ? null : keep;
  };

  const save = (takes: boolean, picked: string[]) => {
    setErr(null);
    start(async () => {
      const out = await updateBusinessProfileAction({
        businessId: business.id,
        styles: business.styles,
        socials: business.socials,
        foundedYear: business.foundedYear,
        phone: business.phone,
        contactEmail: business.contactEmail,
        accepts: business.accepts,
        enquiryTypes: next(takes, picked),
      });
      if (out.error) {
        setErr(out.error);
        return;
      }
      router.refresh();
    });
  };

  const liveCount = on ? all.filter((k) => kinds.includes(k)).length : 0;

  return (
    <div style={{ background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "12px 14px", marginTop: 10 }}>
      <button
        type="button"
        aria-expanded={open}
        /* "ENQUIRY SETTINGS" (2 Oct 2026, the user: "what you take in enquiries
           should be enquiry settings") — the visible word and the accessible name
           move together, the 27 Sep rule */
        aria-label={showName ? `Enquiry settings — ${business.name}` : "Enquiry settings"}
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", color: "var(--text)", textAlign: "left" }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ ...fieldLabel, margin: 0, display: "block" }}>Enquiry settings{showName ? ` · ${business.name}` : ""}</span>
          {/* the one figure that says the state without opening anything */}
          <span style={{ fontSize: 11.5, fontWeight: 800, color: SUB }}>{on ? `${liveCount} of ${all.length} kinds` : "Not taking enquiries"}</span>
        </span>
        <span aria-hidden="true" style={{ fontSize: 15, color: MUTED, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>
          ›
        </span>
      </button>

      {open ? (
        <>
          <Switch
            on={on}
            label="Take enquiries"
            onClick={() => {
              const v = !on;
              setOn(v);
              save(v, kinds);
            }}
          />
          {/* the kinds, only while the button is on — a list of what you take
              under a switch that says you take none is a control with nothing
              to govern */}
          {on ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
              {enquiryTypesFor(business.type).map((t) => {
                const lit = kinds.includes(t.k);
                return (
                  <button
                    key={t.k}
                    type="button"
                    aria-pressed={lit}
                    aria-label={t.label}
                    disabled={pending}
                    onClick={() => {
                      const picked = lit ? kinds.filter((k) => k !== t.k) : [...kinds, t.k];
                      setKinds(picked);
                      save(true, picked);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "7px 12px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: pending ? "default" : "pointer",
                      fontFamily: "inherit",
                      background: lit ? "var(--text)" : "var(--card)",
                      color: lit ? "var(--solid)" : SUB,
                      border: `1.5px solid ${lit ? "var(--text)" : "var(--el)"}`,
                    }}
                  >
                    {lit ? "✓" : "＋"} {t.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          {/* the one thing the chips cannot say: where the button they govern is drawn */}
          <div style={{ fontSize: 10.5, color: MUTED, marginTop: 8 }}>
            {on ? "The Enquiry button on its page offers these." : "No Enquiry button on its page."}
          </div>
          {err ? (
            <div role="alert" style={{ fontSize: 11.5, color: "#F87171", marginTop: 6 }}>
              {err}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
