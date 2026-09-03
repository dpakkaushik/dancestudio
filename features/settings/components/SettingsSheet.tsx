"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signOutAction } from "@/features/auth/server-actions/auth";
import { setNotificationPrefsAction } from "@/features/notifications/server-actions/notifications";
import { endArtistPlanAction, updateTenantProfileAction } from "@/features/settings/server-actions/plans";
import { DOS_UI, INK, MUTED, RED, SUB } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import type { ArtistPlan } from "@/repositories/plans";
import { PLAN_PRICE } from "@/repositories/plans";
import { enquiryTypesFor } from "@/types/enquiry";
import type { NotificationPrefs } from "@/types/notification";
import { NOTIF_KINDS } from "@/types/notification";
import type { ProfileRole } from "@/types/profile";
import type { Tenant } from "@/types/tenant";
import { dateWords } from "./settings-kit";

/** THE SETTINGS SHEET — prototype S_profiletab 11402-11440, opened by the top
 *  bar's gear (19263: "if you are on the Profile tab, open settings now; else go
 *  there and open it"). The blue-grey hero "Settings · profiles · appearance ·
 *  account", YOUR PLAN with the Artist tools strip (8850-8870: "Dancer is who you
 *  are; Artist is a TOOLSET on that same profile — never a second identity") and
 *  its PRO badge, then one card per row — Payments · Invoices · Refunds ·
 *  Enquiry types · Subscription · Notifications · Language · Privacy & data ·
 *  Help & support · Log out.
 *
 *  Every row that has a screen in the prototype has one here now: Payments
 *  (S_payments), Invoices (S_invoices), Refunds (S_refunds) and Subscription
 *  (S_subscr) are pages, Enquiry types is the prototype's own sheet (9000-9030)
 *  saved onto the business, Notifications is the real prefs. The Artist tools
 *  switch is what the prototype makes it — the Artist plan's switch (8855: a
 *  locked strip opens the plan; an active one shows PRO and its date) — so
 *  switching it on with no plan goes to /subscription, where the plan is free
 *  during the pilot. Language, Privacy and Help keep their honest panels. */

const card: React.CSSProperties = { background: "var(--card)", borderRadius: 16, padding: "12px 14px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer", width: "100%", textAlign: "left", border: "none", fontFamily: "inherit", color: INK, textDecoration: "none", boxSizing: "border-box" };
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
  business,
  plan,
  prefs,
}: {
  open: boolean;
  onClose: () => void;
  role: ProfileRole;
  /** the first business this person runs, for the rows that live on its desk */
  business: Tenant | null;
  /** the Artist plan, when one has been taken */
  plan: ArtistPlan | null;
  prefs: NotificationPrefs;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState<string | null>(null);
  const [lang, setLang] = useState("English");
  const [enqOpen, setEnqOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useCloseOnBack(onClose, open);
  useCloseOnBack(() => setEnqOpen(false), enqOpen);
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };
  if (!open) return null;

  const isDancer = role === "dancer";
  const artistOn = Boolean(plan?.active);
  /* the strip is the plan's switch (8855): off → the plan page; on → end it, which puts the role back */
  const flipArtist = () => {
    if (!artistOn) {
      onClose();
      router.push("/subscription");
      return;
    }
    start(async () => {
      const out = await endArtistPlanAction();
      if (out.error) return fire(out.error);
      fire("Artist tools off — back to dancing");
      router.refresh();
    });
  };
  const flipKind = (k: keyof NotificationPrefs["kinds"]) =>
    start(async () => {
      const out = await setNotificationPrefsAction({ ...prefs, kinds: { ...prefs.kinds, [k]: !prefs.kinds[k] } });
      if (out.error) return fire(out.error);
      router.refresh();
    });

  /* ENQUIRIES YOU ACCEPT — null on the record means every type the kind allows (9010) */
  const enqAll = business ? enquiryTypesFor(business.type) : [];
  const enqOn = (k: string) => !business?.enquiryTypes || business.enquiryTypes.includes(k);
  const flipEnq = (k: string) => {
    if (!business) return;
    const next = enqAll.map((t) => t.k).filter((kk) => (kk === k ? !enqOn(kk) : enqOn(kk)));
    start(async () => {
      const out = await updateTenantProfileAction({ tenantId: business.id, about: business.about, foundedYear: business.foundedYear, phone: business.phone, socials: business.socials, enquiryTypes: next.length === enqAll.length ? null : next, accepts: business.accepts });
      if (out.error) return fire(out.error);
      router.refresh();
    });
  };
  const enqCount = enqAll.filter((t) => enqOn(t.k)).length;

  const kindsOn = Object.values(prefs.kinds).filter(Boolean).length;
  const desk = business ? `/business/${business.id}` : null;
  /* a business's rows go to its desk; a person's to their own */
  const rows: Array<{ l: string; v: string; href?: string; sheet?: "enq" }> = [
    { l: isDancer || !desk ? "💳 Payments" : "💳 Payments & verification", v: isDancer || !desk ? "cards · UPI · saved methods" : "cards · UPI · cash · KYC", href: isDancer || !desk ? "/payments" : `${desk}/payments` },
    { l: "🧾 Invoices", v: "billing history · export", href: isDancer || !desk ? "/invoices" : `${desk}/invoices` },
    { l: "↩️ Refunds", v: "requests · approvals · receipts", href: isDancer || !desk ? "/refunds" : `${desk}/refunds` },
    ...(business ? [{ l: "📩 Enquiry types", v: `${enqCount} of ${enqAll.length} switched on`, sheet: "enq" as const }] : []),
    ...(!isDancer || artistOn ? [{ l: "⭐ Subscription", v: artistOn && plan ? `Artist plan · until ${dateWords(plan.until)}` : "your DanceOS plan · billing", href: "/subscription" }] : []),
    { l: "🔔 Notifications", v: `${kindsOn} categor${kindsOn === 1 ? "y" : "ies"} · ${prefs.whatsapp ? "WhatsApp on" : "WhatsApp off"}` },
    { l: "🌐 Language", v: "English · हिन्दी coming" },
    { l: "🛡 Privacy & data", v: "Export · Delete (DPDP)" },
    { l: "🆘 Help & support", v: "FAQ · report a problem" },
  ];

  const panelFor = (l: string) => {
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
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 900 }}>Artist tools</span>
                {artistOn ? <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.5, padding: "2px 7px", borderRadius: 999, background: "rgba(236,72,153,.18)", color: "#EC4899" }}>PRO ACTIVE</span> : <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.5, padding: "2px 7px", borderRadius: 999, background: "var(--el)", color: SUB }}>PRO</span>}
              </span>
              <span style={{ display: "block", fontSize: 9.5, color: SUB, marginTop: 1 }}>{artistOn && plan ? `teach · publish · earnings · until ${dateWords(plan.until)}` : `teach · publish · earnings · students · ${PLAN_PRICE.monthly.words}`}</span>
            </span>
            <span aria-hidden="true" style={{ width: 40, height: 22, borderRadius: 11, flexShrink: 0, position: "relative", transition: "background .2s", background: artistOn ? "#EC4899" : "var(--el)", display: "inline-block" }}>
              <span style={{ position: "absolute", top: 2, left: artistOn ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .2s" }} />
            </span>
          </button>
        ) : null}
        <div style={{ fontSize: 9, color: MUTED, margin: "0 2px 10px", lineHeight: 1.5 }}>Your studios and crews live on the Home tab under “Run your business”.</div>

        {rows.map((r) =>
          r.href ? (
            <Link key={r.l} href={r.href} onClick={onClose} style={card}>
              <b style={{ fontSize: 13.5 }}>{r.l}</b>
              <span style={{ color: SUB, fontSize: 12, textAlign: "right" }}>{r.v} ›</span>
            </Link>
          ) : r.sheet === "enq" ? (
            <button type="button" key={r.l} onClick={() => setEnqOpen(true)} style={card}>
              <b style={{ fontSize: 13.5 }}>{r.l}</b>
              <span style={{ color: SUB, fontSize: 12, textAlign: "right" }}>{r.v} ›</span>
            </button>
          ) : (
            <div key={r.l}>
              <button type="button" onClick={() => setMenu((m) => (m === r.l ? null : r.l))} aria-expanded={menu === r.l} style={card}>
                <b style={{ fontSize: 13.5 }}>{r.l}</b>
                <span style={{ color: SUB, fontSize: 12, textAlign: "right" }}>{r.v}</span>
              </button>
              {menu === r.l ? panelFor(r.l) : null}
            </div>
          ),
        )}
        <form action={signOutAction}>
          <button type="submit" style={{ ...card, border: `1.5px solid ${RED}` }}>
            <b style={{ fontSize: 13.5, color: RED }}>↪ Log out</b>
            <span style={{ color: SUB, fontSize: 12 }}>sign out on this device · data stays safe</span>
          </button>
        </form>

        {/* ── ENQUIRIES YOU ACCEPT (9000-9030) ── */}
        {enqOpen && business ? (
          <div onClick={() => setEnqOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.66)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 940 }}>
            <div role="dialog" aria-modal="true" aria-label="Enquiry types" onClick={(e) => e.stopPropagation()} style={{ background: "var(--solid)", color: INK, borderRadius: "24px 24px 0 0", padding: "16px 16px 26px", width: "100%", maxWidth: 430, boxSizing: "border-box", animation: "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)" }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
              <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.2, color: MUTED }}>ENQUIRIES YOU ACCEPT</div>
              <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 2 }}>Enquiry types</div>
              <div style={{ fontSize: 11, color: SUB, marginBottom: 12 }}>Only the types you switch on appear when someone taps Enquiry on {business.name}&apos;s profile.</div>
              {enqAll.map((t) => {
                const on = enqOn(t.k);
                return (
                  <button type="button" key={t.k} role="switch" aria-checked={on} aria-label={t.label} disabled={pending} onClick={() => flipEnq(t.k)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 0", borderBottom: "1px solid var(--el)", cursor: "pointer", width: "100%", background: "none", border: "none", borderBottomStyle: "solid", fontFamily: "inherit", color: INK, textAlign: "left" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: t.c, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12.5, fontWeight: 800 }}>{t.label}</span>
                      <span style={{ display: "block", fontSize: 10, color: SUB, marginTop: 1 }}>{t.sub}</span>
                    </span>
                    <span aria-hidden="true" style={{ width: 42, height: 24, borderRadius: 12, flexShrink: 0, background: on ? "#22C55E" : "var(--el)", position: "relative", display: "inline-block" }}>
                      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .15s" }} />
                    </span>
                  </button>
                );
              })}
              <div style={{ fontSize: 10.5, color: MUTED, margin: "10px 0 14px" }}>
                {enqCount} of {enqAll.length} switched on
              </div>
              <button type="button" onClick={() => setEnqOpen(false)} style={{ textAlign: "center", padding: 14, borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 14, cursor: "pointer", border: "none", fontFamily: "inherit", width: "100%" }}>
                Done
              </button>
            </div>
          </div>
        ) : null}

        {toast ? <div role="status" style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", color: INK, padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650, boxShadow: "0 6px 24px rgba(0,0,0,.45)" }}>{toast}</div> : null}
      </div>
    </div>
  );
}
