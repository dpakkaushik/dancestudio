"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/features/profiles/components/ContactEditor";
import { fieldLabel } from "@/features/profiles/components/profile-kit";
import { updateBusinessProfileAction } from "@/features/settings/server-actions/plans";
import { DOS_DISPLAY, MUTED, SUB } from "@/lib/design/tokens";
import { ToolFace } from "@/components/ui/ToolCard";
import { EnqIcon } from "@/features/inbox/components/inbox-kit";
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

  /* ⚠ RE-CUT (12 Oct 2026, the user: "enquiry settings needs a revamp"). One
     card per business: its face and name with a status pill, the master switch
     as a row of its own, then every kind as a FULL ROW — its icon in its tint,
     its name, what it covers and its own switch — where they were a cluster of
     ✓/＋ chips that said nothing about what each kind was. */
  return (
    <div style={{ background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 18, padding: 14, marginTop: 10, opacity: pending ? 0.75 : 1, transition: "opacity .15s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <ToolFace name={business.name} photoPath={business.photoPath ?? null} tint="#8B5CF6" size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {showName ? <div style={{ ...fieldLabel, margin: 0 }}>For</div> : null}
          <div style={{ fontFamily: DOS_DISPLAY, fontSize: 15, fontWeight: 800, letterSpacing: -0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{business.name}</div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: SUB, marginTop: 2 }}>{on ? `${liveCount} of ${all.length} kinds` : "Not taking enquiries"}</div>
        </div>
        <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 900, letterSpacing: 0.7, padding: "4px 9px", borderRadius: 999, background: on ? "#22C55E1c" : "var(--el)", color: on ? "#22C55E" : SUB }}>{on ? "OPEN" : "CLOSED"}</span>
      </div>

      <div style={{ marginTop: 10, borderTop: "1.5px solid var(--el)", paddingTop: 2 }}>
        <Switch
          on={on}
          label="Take enquiries"
          onClick={() => {
            const v = !on;
            setOn(v);
            save(v, kinds);
          }}
        />
        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>
          {on ? "The Enquiry button on your page offers the kinds switched on below." : "No Enquiry button on your page."}
        </div>
      </div>

      {/* the kinds, only while the button is on — a list of what you take under
          a switch that says you take none is a control with nothing to govern */}
      {on ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {enquiryTypesFor(business.type).map((t) => {
            const lit = kinds.includes(t.k);
            return (
              <button
                key={t.k}
                type="button"
                role="switch"
                aria-checked={lit}
                aria-label={t.label}
                disabled={pending}
                onClick={() => {
                  const picked = lit ? kinds.filter((k) => k !== t.k) : [...kinds, t.k];
                  setKinds(picked);
                  save(true, picked);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 14,
                  cursor: pending ? "default" : "pointer",
                  fontFamily: "inherit",
                  color: "var(--text)",
                  background: lit ? `${t.c}14` : "transparent",
                  border: `1.5px solid ${lit ? `${t.c}66` : "var(--el)"}`,
                }}
              >
                <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `${t.c}22` }}>
                  <EnqIcon k={t.k} size={19} color={t.c} sw={2} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 900 }}>{t.label}</span>
                  <span style={{ display: "block", fontSize: 11, color: SUB, marginTop: 2 }}>{t.sub}</span>
                </span>
                <Knob on={lit} tint={t.c} />
              </button>
            );
          })}
        </div>
      ) : null}
      {err ? (
        <div role="alert" style={{ fontSize: 11.5, color: "#F87171", marginTop: 8 }}>
          {err}
        </div>
      ) : null}
    </div>
  );
}

function Knob({ on, tint }: { on: boolean; tint: string }) {
  return (
    <span aria-hidden="true" style={{ position: "relative", width: 40, height: 23, borderRadius: 999, flexShrink: 0, background: on ? tint : "var(--el)", transition: "background .15s" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 20 : 3, width: 17, height: 17, borderRadius: 999, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)", transition: "left .15s" }} />
    </span>
  );
}
