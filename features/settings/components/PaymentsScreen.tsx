"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateTenantProfileAction } from "@/features/settings/server-actions/plans";
import type { MethodUse } from "@/repositories/invoices";
import type { AcceptedMethods, Tenant } from "@/types/tenant";
import { BizPage, BizToast, bizBtn, bizCard, dayWords, eyebrow, rupees } from "./settings-kit";

/** S_payments (16531-16620): "Payments" for a person, "Payments & verification"
 *  for a business — the Payments · Verification switch, YOUR METHODS as a card
 *  per method with its colour on the edge, the ADD A METHOD tiles (UPI · Card ·
 *  Cash · Netbanking), ACCEPTED FROM STUDENTS as four switches, and the
 *  Verification tab's green card over its checklist.
 *
 *  What is real here, said out loud: the prototype's methods are a store the
 *  booking sheets read from (its own comment at 16534). Ours are the methods
 *  that ACTUALLY PAID — counted off Step 9's `payments.method` — because
 *  Cashfree takes a card or a UPI id at checkout and DanceOS stores neither, so
 *  a saved-methods list would be a copy nobody could pay with; the ADD tiles say
 *  so when pressed. The ACCEPTED switches are the business's real answer
 *  (`tenants.accepts_*`, saved through one owner-only door) and the public page
 *  reads them back. The verification checklist names the documents Cashfree's
 *  KYC collects; DanceOS holds none of them, and the tick (`verified_at`) is set
 *  when that KYC clears — never by the business itself. */

type Kind = "UPI" | "Card" | "Cash" | "Netbanking";
const COL: Record<Kind, string> = { UPI: "#22C55E", Card: "#3B82F6", Cash: "#F59E0B", Netbanking: "#8B5CF6" };
const kindOf = (m: string): Kind => {
  const s = m.toLowerCase();
  if (s.includes("upi") || s.includes("qr")) return "UPI";
  if (s.includes("card")) return "Card";
  if (s.includes("cash")) return "Cash";
  return "Netbanking";
};
function Icon({ k, color }: { k: Kind; color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {k === "UPI" ? <path d="M5 12h14M12 5v14" /> : null}
      {k === "Card" ? (
        <>
          <rect x="3" y="6" width="18" height="12" rx="2.5" />
          <path d="M3 10.5h18" />
        </>
      ) : null}
      {k === "Cash" ? (
        <>
          <rect x="3" y="7" width="18" height="10" rx="2" />
          <circle cx="12" cy="12" r="2.4" />
        </>
      ) : null}
      {k === "Netbanking" ? <path d="M4 20h16M5 20V10l7-5 7 5v10" /> : null}
    </svg>
  );
}
const Tick = ({ color = "#22C55E", size = 13, w = 3 }: { color?: string; size?: number; w?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

const ACCEPT_ROWS: Array<[keyof AcceptedMethods, string]> = [
  ["upi", "UPI / QR at desk"],
  ["cards", "Cards (Cashfree)"],
  ["cash", "Cash"],
  ["bank", "Bank transfer"],
];

export function PaymentsScreen({ side, methods, tenant = null, canEdit = false }: { side: "mine" | "tenant"; methods: MethodUse[]; tenant?: Tenant | null; canEdit?: boolean }) {
  const router = useRouter();
  const [pv, setPv] = useState<"pay" | "ver">("pay");
  const [add, setAdd] = useState<Kind | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };
  const isBiz = side === "tenant" && tenant !== null;
  const verified = Boolean(tenant?.verifiedAt);

  const flip = (k: keyof AcceptedMethods) => {
    if (!tenant) return;
    if (!canEdit) return fire("Only the owner changes what the business accepts");
    const accepts = { ...tenant.accepts, [k]: !tenant.accepts[k] };
    start(async () => {
      const out = await updateTenantProfileAction({ tenantId: tenant.id, about: tenant.about, foundedYear: tenant.foundedYear, phone: tenant.phone, socials: tenant.socials, enquiryTypes: tenant.enquiryTypes, accepts });
      if (out.error) return fire(out.error);
      fire(`${ACCEPT_ROWS.find(([kk]) => kk === k)?.[1]} ${accepts[k] ? "enabled" : "disabled"}`);
      router.refresh();
    });
  };

  const checklist: Array<[string, string]> =
    tenant?.type === "studio"
      ? [
          ["Business proof", "GST or shop registration"],
          ["Address proof", "A utility bill for the premises"],
          ["Owner KYC", "Aadhaar + PAN"],
          ["Bank penny-drop", "₹1 sent to the settlement account"],
          ["Insurance", "Public liability cover"],
        ]
      : [
          ["Identity", "Aadhaar"],
          ["PAN", "For settlements and TDS"],
          ["Bank penny-drop", "₹1 sent to the settlement account"],
          ["Teaching proof", "Two studio references"],
          ["Police check", "Optional for kids' batches"],
        ];
  /* the first four are what Cashfree's KYC clears; the fifth is optional in the prototype too */
  const doneRow = (i: number) => verified && i < 4;

  return (
    <BizPage title={isBiz ? "Payments & verification" : "Payments"} sub={pv === "pay" ? "Cards · UPI · cash" : "Trust & compliance"} grad="linear-gradient(135deg,#22C55E,#3B82F6)">
      <div style={{ display: "flex", gap: 2, background: "var(--el)", borderRadius: 12, padding: 3, marginBottom: 11 }}>
        {([["pay", "Payments"], ...(isBiz ? [["ver", "Verification"]] : [])] as Array<["pay" | "ver", string]>).map(([k, l]) => (
          <button type="button" key={k} aria-pressed={pv === k} onClick={() => setPv(k)} style={{ flex: 1, textAlign: "center", padding: "8px 2px", borderRadius: 9, cursor: "pointer", fontSize: 11.5, fontWeight: 800, border: "none", fontFamily: "inherit", background: pv === k ? "var(--solid)" : "transparent", color: pv === k ? "var(--text)" : "var(--sub)", boxShadow: pv === k ? "0 1px 4px rgba(0,0,0,.3)" : "none" }}>
            {l}
          </button>
        ))}
      </div>

      {pv === "ver" && isBiz ? (
        <>
          <div style={{ ...bizCard, borderLeft: `4px solid ${verified ? "#22C55E" : "#F59E0B"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 36, height: 36, borderRadius: 18, background: verified ? "rgba(34,197,94,.16)" : "rgba(245,158,11,.16)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {verified ? (
                  <Tick size={18} w={2.4} />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="8.5" />
                    <path d="M12 8v4.5" />
                  </svg>
                )}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 900 }}>{verified ? (tenant.type === "studio" ? "Verified studio" : "Verified artist") : "Not verified yet"}</div>
                <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>{verified ? "Green tick shown on your profile and cards" : "The tick appears once Cashfree's KYC clears your account"}</div>
              </div>
            </div>
          </div>
          {checklist.map(([t, sub], i) => {
            const done = doneRow(i);
            return (
              <div key={t} style={{ ...bizCard, display: "flex", alignItems: "center", gap: 11, padding: "11px 13px" }}>
                <span style={{ width: 26, height: 26, borderRadius: 13, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: done ? "rgba(34,197,94,.16)" : "rgba(245,158,11,.16)" }}>
                  {done ? (
                    <Tick />
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="8.5" />
                      <path d="M12 8v4.5" />
                    </svg>
                  )}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>{t}</div>
                  <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>{sub}</div>
                </div>
                <button type="button" onClick={() => fire(done ? `${t} cleared with Cashfree — DanceOS keeps no copy` : `${t} is collected by Cashfree's KYC, not uploaded here`)} style={{ fontSize: 10, fontWeight: 800, color: done ? "var(--sub)" : "#F59E0B", cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>
                  {done ? "View" : "Upload"}
                </button>
              </div>
            );
          })}
          <button type="button" onClick={() => fire(verified ? `Verified ${dayWords(tenant.verifiedAt as string)} — no review is due` : "Verification runs through Cashfree's KYC when the account goes live")} style={bizBtn}>
            {verified ? "Re-verify documents" : "Start verification"}
          </button>
          <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5, margin: "8px 2px 0" }}>DanceOS never holds an Aadhaar, a PAN or a bank statement. The tick is set by DanceOS when the rail&apos;s KYC clears — a business cannot tick itself.</div>
        </>
      ) : null}

      {pv === "pay" ? (
        <>
          <div style={eyebrow}>{isBiz ? "HOW STUDENTS PAID" : "YOUR METHODS"} · {methods.length}</div>
          {methods.map((m) => {
            const k = kindOf(m.method);
            return (
              <div key={m.method} style={{ ...bizCard, borderLeft: `4px solid ${COL[k]}`, display: "flex", alignItems: "center", gap: 11, padding: "12px 13px" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${COL[k]}1c`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon k={k} color={COL[k]} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>
                    {m.method}
                    {methods[0] === m ? <span style={{ marginLeft: 6, fontSize: 8.5, fontWeight: 900, padding: "2px 7px", borderRadius: 999, background: "rgba(34,197,94,.16)", color: "#22C55E" }}>MOST USED</span> : null}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>
                    {k} · {m.count} payment{m.count === 1 ? "" : "s"} · {rupees(m.totalInr)} · last {dayWords(m.lastAt)}
                  </div>
                </div>
              </div>
            );
          })}
          {methods.length === 0 ? <div style={{ ...bizCard, fontSize: 12, color: "var(--sub)", lineHeight: 1.5 }}>{isBiz ? "Nothing taken yet. The first paid booking shows how it was paid here." : "Nothing paid yet. Your first paid booking shows how you paid here — Cashfree asks for the card or UPI id at checkout."}</div> : null}

          <div style={{ ...eyebrow, margin: "12px 0 8px" }}>ADD A METHOD</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {(["UPI", "Card", "Cash", "Netbanking"] as Kind[]).map((k) => (
              <button type="button" key={k} aria-pressed={add === k} onClick={() => setAdd((a) => (a === k ? null : k))} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "12px 4px", borderRadius: 14, cursor: "pointer", fontFamily: "inherit", background: add === k ? `${COL[k]}18` : "var(--card)", border: `2px solid ${add === k ? COL[k] : "transparent"}`, color: add === k ? COL[k] : "var(--sub)" }}>
                <Icon k={k} color="currentColor" />
                <span style={{ fontSize: 10, fontWeight: 800 }}>{k}</span>
              </button>
            ))}
          </div>
          {add ? (
            <div style={bizCard}>
              <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)", marginBottom: 7 }}>{add === "UPI" ? "UPI ID" : add === "Card" ? "CARD NUMBER" : add === "Cash" ? "COUNTER NAME" : "ACCOUNT"}</div>
              <div style={{ fontSize: 12, color: "var(--sub)", lineHeight: 1.55 }}>
                {add === "Cash"
                  ? isBiz
                    ? "Cash is taken at your desk and marked on the class's register — switch it on under ACCEPTED FROM STUDENTS below."
                    : "Cash is paid at the studio's desk and marked there — nothing to save."
                  : `${add === "Netbanking" ? "A bank account" : `A ${add === "UPI" ? "UPI id" : "card"}`} is entered on Cashfree's checkout when you pay, and never stored on DanceOS — so there is nothing to save here yet. Saved instruments arrive with Cashfree's token vault.`}
              </div>
              <button type="button" onClick={() => setAdd(null)} style={{ ...bizBtn, marginTop: 9 }}>
                Got it
              </button>
            </div>
          ) : null}

          {isBiz ? (
            <div style={{ ...bizCard, marginTop: 10 }}>
              <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)", marginBottom: 8 }}>ACCEPTED FROM STUDENTS</div>
              {ACCEPT_ROWS.map(([k, l]) => {
                const on = tenant.accepts[k];
                return (
                  <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--el)" }}>
                    <span style={{ fontSize: 12.5 }}>{l}</span>
                    <button type="button" role="switch" aria-checked={on} aria-label={l} disabled={pending} onClick={() => flip(k)} style={{ width: 38, height: 22, borderRadius: 11, background: on ? "#22C55E" : "var(--el)", position: "relative", cursor: "pointer", border: "none", padding: 0, flexShrink: 0 }}>
                      <span style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: 8, background: "#fff", transition: "left .15s" }} />
                    </button>
                  </div>
                );
              })}
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>What is switched on is printed on your public page. Cards and UPI through the app are Cashfree&apos;s; cash and bank transfer are recorded at the desk.</div>
            </div>
          ) : null}
        </>
      ) : null}
      <BizToast msg={toast} />
    </BizPage>
  );
}
