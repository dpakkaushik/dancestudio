"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/features/profiles/components/ContactEditor";
import { fieldLabel } from "@/features/profiles/components/profile-kit";
import { updateBusinessProfileAction } from "@/features/settings/server-actions/plans";
import { MUTED, SUB } from "@/lib/design/tokens";
import { BottomSheet } from "@/components/ui/RequestSettingsSheet";
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
 *  ⚠ A CREW TAKES NO ENQUIRIES since 4 Oct 2026, so it has no settings here.
 *  A studio switches two kinds on or off (Choreographer · Performer) and an
 *  artist three (+ Judge / Guest) — `enquiryTypesFor` decides, never a list
 *  typed here. */
export function EnquirySettings({ businesses }: { businesses: Business[] }) {
  const [open, setOpen] = useState(false);
  if (businesses.length === 0) return null;
  /* ⚠ A GEAR IN THE INBOX'S TOP RIGHT (12 Oct 2026, the user: "enquiry setting
     becomes icon on top right") — the disclosure that sat under the heading is
     a bottom sheet behind one round button, the Classes gear's own shape in the
     page's ink (the Inbox's head is not a solid hero, so white would vanish) */
  return (
    <>
      <button
        type="button"
        aria-label="Enquiry settings"
        data-testid="enquiry-settings"
        onClick={() => setOpen(true)}
        style={{ position: "absolute", top: 0, right: 0, width: 38, height: 38, borderRadius: 19, border: "1.5px solid var(--el)", background: "var(--card)", color: "var(--text)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open ? (
        <BottomSheet title="Enquiry settings" onClose={() => setOpen(false)} scroll>
          {businesses.map((t) => (
            <OneBusiness key={t.id} business={t} showName={businesses.length > 1} />
          ))}
        </BottomSheet>
      ) : null}
    </>
  );
}

function OneBusiness({ business, showName }: { business: Business; showName: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
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
      {showName ? <div style={{ ...fieldLabel, margin: 0 }}>{business.name}</div> : null}
      {(
        <>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: SUB, marginTop: 8 }}>{on ? `${liveCount} of ${all.length} kinds` : "Not taking enquiries"}</div>
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
      )}
    </div>
  );
}
