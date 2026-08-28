"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signOutAction } from "@/features/auth/server-actions/auth";
import { setNotificationPrefsAction } from "@/features/notifications/server-actions/notifications";
import { setMyRoleAction } from "@/features/settings/server-actions/settings";
import { DOS_UI, INK, MUTED, RED, SUB } from "@/lib/design/tokens";
import type { NotificationPrefs } from "@/types/notification";
import { NOTIF_KINDS } from "@/types/notification";
import type { ProfileRole } from "@/types/profile";

/** THE SETTINGS SHEET — prototype S_profiletab 11402-11440, opened by the top
 *  bar's gear (19263: "if you are on the Profile tab, open settings now; else go
 *  there and open it"). The blue-grey hero "Settings · profiles · appearance ·
 *  account", YOUR PLAN with the Artist tools strip (8850-8870: "Dancer is who you
 *  are; Artist is a TOOLSET on that same profile — never a second identity"),
 *  then one card per row — Payments · Invoices · Refunds · Enquiry types ·
 *  Subscription · Notifications · Language · Privacy & data · Help & support ·
 *  Log out — each opening inline or going where the thing lives.
 *
 *  Honesty over theatre: a row goes to a real screen when one exists (Refunds,
 *  Invoices and Payments live on bookings, classes and the earnings desk;
 *  Notifications has its own page and its toggles are the real prefs); where the
 *  prototype fires a demo toast ("request queued", "opening"), this sheet says
 *  what is true today instead, and the backlog carries the row. The PRO badge
 *  and the ₹799/mo upsell are not drawn: there is no subscription to sell. */

const card: React.CSSProperties = { background: "var(--card)", borderRadius: 16, padding: "12px 14px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer", width: "100%", textAlign: "left", border: "none", fontFamily: "inherit", color: INK };
const panel: React.CSSProperties = { background: "var(--el)", borderRadius: 12, padding: "10px 12px", margin: "-4px 0 8px", fontSize: 12.5, color: INK, lineHeight: 1.5 };
const link: React.CSSProperties = { color: "#5AC8FA", fontWeight: 800, textDecoration: "none" };

function Toggle({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" style={{ width: 36, height: 20, borderRadius: 10, background: on ? "#22C55E" : "var(--card)", position: "relative", transition: "background .15s", flexShrink: 0, display: "inline-block" }}>
      <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: 8, background: "#fff", transition: "left .15s" }} />
    </span>
  );
}

export function SettingsSheet({
  open,
  onClose,
  role,
  businessId,
  prefs,
}: {
  open: boolean;
  onClose: () => void;
  role: ProfileRole;
  /** the first business this person runs, for the rows that live on its desk */
  businessId: string | null;
  prefs: NotificationPrefs;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState<string | null>(null);
  const [lang, setLang] = useState("English");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };
  if (!open) return null;

  const isDancer = role === "dancer";
  const artistOn = role === "trainer";
  const flipArtist = () =>
    start(async () => {
      const out = await setMyRoleAction({ role: artistOn ? "dancer" : "trainer" });
      if (out.error) return fire(out.error);
      fire(artistOn ? "Artist tools off — back to dancing" : "👩‍🏫 Artist tools on — same profile, now with teaching, classes & earnings");
      router.refresh();
    });
  const flipKind = (k: keyof NotificationPrefs["kinds"]) =>
    start(async () => {
      const out = await setNotificationPrefsAction({ ...prefs, kinds: { ...prefs.kinds, [k]: !prefs.kinds[k] } });
      if (out.error) return fire(out.error);
      router.refresh();
    });

  const kindsOn = Object.values(prefs.kinds).filter(Boolean).length;
  const rows: Array<[string, string]> = [
    [isDancer ? "💳 Payments" : "💳 Payments & verification", isDancer ? "cards · UPI · saved methods" : "cards · UPI · cash · KYC"],
    ["🧾 Invoices", "billing history · export"],
    ["↩️ Refunds", "requests · approvals · receipts"],
    ...(!isDancer ? ([["📩 Enquiry types", "choose what people can send you"]] as Array<[string, string]>) : []),
    ...(!isDancer ? ([["⭐ Subscription", "your DanceOS plan · billing"]] as Array<[string, string]>) : []),
    ["🔔 Notifications", `${kindsOn} categor${kindsOn === 1 ? "y" : "ies"} · ${prefs.whatsapp ? "WhatsApp on" : "WhatsApp off"}`],
    ["🌐 Language", "English · हिन्दी coming"],
    ["🛡 Privacy & data", "Export · Delete (DPDP)"],
    ["🆘 Help & support", "FAQ · report a problem"],
  ];
  const desk = businessId ? `/business/${businessId}` : null;

  const panelFor = (l: string) => {
    if (l.includes("Payments"))
      return (
        <div style={panel}>
          Cards and UPI are taken by Cashfree at checkout — nothing about a card is stored on DanceOS.{" "}
          {isDancer ? (
            <>Your bookings and their receipts are under <Link href="/my-classes" style={link}>All bookings ›</Link></>
          ) : desk ? (
            <>What came in, by method, is on the <Link href={`${desk}/earnings`} style={link}>Earnings desk ›</Link>. Verification (KYC) happens with Cashfree when the account goes live.</>
          ) : (
            <>Set up a business to take payments.</>
          )}
        </div>
      );
    if (l.includes("Invoices"))
      return (
        <div style={panel}>
          {isDancer || !desk ? (
            <>Every booking carries its invoice on the class page. <Link href="/my-classes" style={link}>All bookings ›</Link></>
          ) : (
            <>Month statements with a CSV download are on the <Link href={`${desk}/earnings`} style={link}>Earnings desk ›</Link></>
          )}
        </div>
      );
    if (l.includes("Refunds"))
      return (
        <div style={panel}>
          {isDancer || !desk ? (
            <>Cancel a booking from its class page — the refund follows the 48-hour policy printed there. <Link href="/my-classes" style={link}>All bookings ›</Link></>
          ) : (
            <>Requests are settled on each class&apos;s Refunds tab. <Link href="/managed" style={link}>Everything you manage ›</Link></>
          )}
        </div>
      );
    if (l.includes("Enquiry types"))
      return <div style={panel}>Every enquiry type is on today — choosing which ones people can send you is on the backlog. <Link href="/inbox" style={link}>Your Inbox ›</Link></div>;
    if (l.includes("Subscription"))
      return <div style={panel}>There is no paid plan yet — every tool is on during the pilot.</div>;
    if (l.includes("Notifications"))
      return (
        <div style={panel}>
          {NOTIF_KINDS.map(({ k, label }) => (
            <button type="button" key={k} disabled={pending} onClick={() => flipKind(k)} aria-pressed={prefs.kinds[k]} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "6px 0", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: INK, fontSize: 12.5 }}>
              <span>{label}</span>
              <Toggle on={prefs.kinds[k]} />
            </button>
          ))}
          <Link href="/notifications" style={{ ...link, display: "block", marginTop: 6, fontSize: 12 }}>All notification settings ›</Link>
        </div>
      );
    if (l.includes("Language"))
      return (
        <div style={panel}>
          {["English", "हिन्दी", "मराठी"].map((x) => (
            <button type="button" key={x} onClick={() => (x === "English" ? setLang(x) : fire(`${x} — coming`))} style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "7px 0", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: INK, fontSize: 12.5 }}>
              <span>{x}</span>
              {lang === x ? <span style={{ color: "#22C55E", fontWeight: 900 }}>✓</span> : null}
            </button>
          ))}
        </div>
      );
    if (l.includes("Privacy"))
      return (
        <div style={panel}>
          <div style={{ padding: "5px 0" }}>Export my data (DPDP)</div>
          <div style={{ padding: "5px 0" }}>Download activity log</div>
          <div style={{ padding: "5px 0", color: "#F87171" }}>Delete account…</div>
          <div style={{ fontSize: 11, color: SUB, marginTop: 4 }}>Self-serve export and deletion arrive with the privacy slice — until then, ask the studio that invited you or the DanceOS team, and it is done by hand.</div>
        </div>
      );
    if (l.includes("Help"))
      return (
        <div style={panel}>
          <div style={{ padding: "5px 0" }}>FAQ</div>
          <div style={{ padding: "5px 0" }}>Report a problem</div>
          <div style={{ padding: "5px 0" }}>Contact support</div>
          <div style={{ fontSize: 11, color: SUB, marginTop: 4 }}>The help centre is not written yet — this row keeps its place until it is.</div>
        </div>
      );
    return null;
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 600, fontFamily: DOS_UI }}>
      <div role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()} style={{ background: "var(--solid)", borderRadius: "24px 24px 0 0", padding: "16px 16px 30px", width: "100%", maxWidth: 430, boxSizing: "border-box", maxHeight: "84vh", overflowY: "auto", color: INK, animation: "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)" }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
        <div style={{ borderRadius: 18, padding: "14px 16px 12px", background: "linear-gradient(135deg,#64748B,#0EA5E9)", color: "#fff", marginBottom: 4 }}>
          <div style={{ fontSize: 19, fontWeight: 900 }}>Settings</div>
          <div style={{ fontSize: 10.5, opacity: 0.88, marginTop: 1 }}>profiles · appearance · account</div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.2, color: MUTED, margin: "14px 0 8px" }}>YOUR PLAN</div>

        {/* ONE profile, no switcher — only the artist toolset lives here (8855) */}
        {role !== "studio" ? (
          <button type="button" disabled={pending} onClick={flipArtist} aria-pressed={artistOn} aria-label="Artist tools" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderRadius: 14, marginBottom: 12, cursor: "pointer", width: "100%", textAlign: "left", fontFamily: "inherit", color: INK, background: artistOn ? "rgba(236,72,153,.10)" : "var(--card)", border: `1px solid ${artistOn ? "rgba(236,72,153,.45)" : "var(--el)"}` }}>
            <span style={{ width: 32, height: 32, borderRadius: 11, flexShrink: 0, background: "rgba(236,72,153,.16)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#EC4899" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="7.5" r="3.2" /><path d="M5.5 20c.8-3.6 3.2-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /></svg>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 900 }}>Artist tools</span>
              <span style={{ display: "block", fontSize: 9.5, color: SUB, marginTop: 1 }}>teach · publish · earnings · students</span>
            </span>
            <span aria-hidden="true" style={{ width: 40, height: 22, borderRadius: 11, flexShrink: 0, position: "relative", transition: "background .2s", background: artistOn ? "#EC4899" : "var(--el)", display: "inline-block" }}>
              <span style={{ position: "absolute", top: 2, left: artistOn ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .2s" }} />
            </span>
          </button>
        ) : null}
        <div style={{ fontSize: 9, color: MUTED, margin: "0 2px 10px", lineHeight: 1.5 }}>Your studios and crews live on the Home tab under “Run your business”.</div>

        {rows.map(([l, v]) => (
          <div key={l}>
            <button type="button" onClick={() => setMenu((m) => (m === l ? null : l))} aria-expanded={menu === l} style={card}>
              <b style={{ fontSize: 13.5 }}>{l}</b>
              <span style={{ color: SUB, fontSize: 12, textAlign: "right" }}>{v}</span>
            </button>
            {menu === l ? panelFor(l) : null}
          </div>
        ))}
        <form action={signOutAction}>
          <button type="submit" style={{ ...card, border: `1.5px solid ${RED}` }}>
            <b style={{ fontSize: 13.5, color: RED }}>↪ Log out</b>
            <span style={{ color: SUB, fontSize: 12 }}>sign out on this device · data stays safe</span>
          </button>
        </form>
        {toast ? <div role="status" style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", color: INK, padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650, boxShadow: "0 6px 24px rgba(0,0,0,.45)" }}>{toast}</div> : null}
      </div>
    </div>
  );
}
