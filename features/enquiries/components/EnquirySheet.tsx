"use client";

import Link from "next/link";
import { useState } from "react";
import { sendEnquiryAction } from "@/features/enquiries/server-actions/enquiries";
import { DOS_CITIES } from "@/lib/constants/cities";
import { DOS_UI } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { enquiryTypesFor, type EnquiryField, type EnquiryType } from "@/types/enquiry";
import type { TenantType } from "@/types/tenant";
import { pressKey } from "@/features/inbox/components/inbox-kit";

/** The sender's sheet, lifted from the prototype's EnquirySheet (5051-5193):
 *  pick what it is for — only the kinds that make sense for who it is going TO
 *  ("Invite as Judge on a studio was offered and meant nothing") — then the
 *  dates, the type's own fields, where, and a short message. It sends through
 *  `send_enquiry`, which enforces the same rules server-side.
 *
 *  One departure, stated: the judge type's "Pick from DanceOS" event picker is
 *  not offered — events are Step 21's — so the event is named in words. */

const inp: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--card)",
  border: "1.5px solid var(--el)",
  borderRadius: 12,
  padding: "11px 12px",
  fontSize: 13,
  color: "var(--text)",
  outline: "none",
  fontFamily: "inherit",
};

function Lab({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)", margin: "12px 0 6px" }}>{children}</div>;
}

const toggle = (on: boolean): React.CSSProperties => ({
  flex: 1,
  textAlign: "center",
  padding: 9,
  borderRadius: 10,
  cursor: "pointer",
  fontSize: 11.5,
  fontWeight: 800,
  background: on ? "var(--text)" : "var(--el)",
  color: on ? "var(--solid)" : "var(--sub)",
});

/** The round trigger + the sheet, in one client island so the server-rendered
 *  profile stays a server component. */
export function EnquiryButton({
  tenantId,
  tenantName,
  tenantType,
  signedIn,
  accent,
  enquiryTypes = null,
}: {
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  signedIn: boolean;
  accent: string;
  /** the types the business switched on (ENQUIRIES YOU ACCEPT, 9005) — null means every one its kind allows */
  enquiryTypes?: string[] | null;
}) {
  const [open, setOpen] = useState(false);
  const box: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 38,
    borderRadius: 11,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 11,
    boxSizing: "border-box",
    padding: "0 4px",
    overflow: "hidden",
    whiteSpace: "nowrap",
    background: "var(--card)",
    color: "var(--text)",
    border: "1px solid var(--el)",
    width: "100%",
    fontFamily: "inherit",
    textDecoration: "none",
  };
  const icon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8z" />
    </svg>
  );
  if (!signedIn) {
    return (
      <Link href="/login" aria-label="Enquiry" style={box}>
        <span style={{ flexShrink: 0, lineHeight: 0, color: "var(--sub)" }}>{icon}</span>Enquiry
      </Link>
    );
  }
  return (
    <>
      <button type="button" aria-label="Enquiry" onClick={() => setOpen(true)} style={box}>
        <span style={{ flexShrink: 0, lineHeight: 0, color: "var(--sub)" }}>{icon}</span>Enquiry
      </button>
      {open ? (
        <EnquirySheet tenantId={tenantId} tenantName={tenantName} tenantType={tenantType} accent={accent} enquiryTypes={enquiryTypes} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

export function EnquirySheet({
  tenantId,
  tenantName,
  tenantType,
  onClose,
  enquiryTypes = null,
}: {
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  enquiryTypes?: string[] | null;
  /** the business page's colour — the sheet wears each TYPE's own colour instead (5119), so this is accepted and unused */
  accent?: string;
  onClose: () => void;
}) {
  useCloseOnBack(onClose);
  /* only the types the business switched on appear (9007) */
  const allowed = enquiryTypesFor(tenantType).filter((t) => !enquiryTypes || enquiryTypes.includes(t.k));
  const [type, setType] = useState<EnquiryType | null>(null);
  const [dateMode, setDateMode] = useState<"single" | "multi">("single");
  const [dates, setDates] = useState<string[]>([""]);
  const [vals, setVals] = useState<Record<string, string | number>>({});
  const [eventName, setEventName] = useState("");
  const [addr, setAddr] = useState("");
  const [city, setCity] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  const [mobile, setMobile] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const setV = (k: string, v: string | number) => {
    setVals((o) => ({ ...o, [k]: v }));
    setErr("");
  };
  const pickType = (t: EnquiryType) => {
    setType(t);
    setDateMode("single");
    setDates([""]);
    setVals({});
    setErr("");
  };

  const submit = async () => {
    if (!type || busy) return;
    const cleanDates = dates.filter(Boolean);
    if (!cleanDates.length) return setErr("Add at least one date");
    const missing = type.fields.find((f) => f.t === "select" && !vals[f.k]);
    if (missing) return setErr(`Choose ${missing.label.toLowerCase()}`);
    if (type.k === "judge" && !eventName.trim()) return setErr("Name the event");
    if (!city) return setErr("Pick the city");
    if (!msg.trim()) return setErr("Add a short message");

    const rows: Array<[string, string]> = [["Enquiry", type.label]];
    if (type.k === "judge") rows.push(["Event", eventName.trim()]);
    type.fields.forEach((f) => {
      if (f.t === "event") return;
      const v = vals[f.k] !== undefined ? vals[f.k] : f.t === "count" ? f.def : "";
      if (v !== "") rows.push([f.label, String(v)]);
    });

    setBusy(true);
    const out = await sendEnquiryAction({
      tenantId,
      typeKey: type.k,
      fields: rows,
      dates: cleanDates,
      whereText: [addr.trim(), city].filter(Boolean).join(", ") || null,
      message: msg.trim(),
      mobile: mobile.trim() || null,
    });
    setBusy(false);
    if (out.error) return setErr(out.error);
    setSent(true);
  };

  const Count = ({ f }: { f: Extract<EnquiryField, { t: "count" }> }) => {
    const v = Number(vals[f.k] !== undefined ? vals[f.k] : f.def);
    const step = (d: number) => setV(f.k, Math.min(f.max, Math.max(f.min, v + d)));
    const btn: React.CSSProperties = {
      width: 30,
      height: 30,
      borderRadius: 15,
      background: "var(--el)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 16,
      fontWeight: 900,
      cursor: "pointer",
      border: "none",
      color: "var(--text)",
      fontFamily: "inherit",
    };
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 12, padding: "9px 12px" }}>
        <button type="button" aria-label={`Fewer ${f.label.toLowerCase()}`} onClick={() => step(-1)} style={btn}>
          −
        </button>
        <span style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: 900 }}>{v}</span>
        <button type="button" aria-label={`More ${f.label.toLowerCase()}`} onClick={() => step(1)} style={btn}>
          +
        </button>
      </div>
    );
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.66)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 930 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Enquiry to ${tenantName}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--solid)",
          color: "var(--text)",
          borderRadius: "24px 24px 0 0",
          padding: "16px 16px 26px",
          width: "100%",
          maxWidth: 430,
          maxHeight: "92vh",
          overflowY: "auto",
          boxSizing: "border-box",
          fontFamily: DOS_UI,
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
        {sent ? (
          <div style={{ textAlign: "center", padding: "6px 0 4px" }}>
            <div style={{ width: 52, height: 52, borderRadius: 26, margin: "0 auto 10px", background: "rgba(34,197,94,.16)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </div>
            <b style={{ fontSize: 17 }}>Enquiry sent</b>
            <div style={{ fontSize: 12, color: "var(--sub)", margin: "5px 0 16px", lineHeight: 1.5 }}>
              {tenantName} will reply in your Inbox.
              <br />
              You&apos;ll get a quote you can accept or decline.
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ width: "100%", textAlign: "center", padding: 14, borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 14, cursor: "pointer", border: "none", fontFamily: "inherit" }}
            >
              Done
            </button>
          </div>
        ) : !type ? (
          <>
            <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.2, color: "var(--muted)" }}>SEND ENQUIRY</div>
            <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 2 }}>What&apos;s it for?</div>
            <div style={{ fontSize: 11, color: "var(--sub)", marginBottom: 12 }}>To {tenantName}</div>
            {allowed.map((x) => (
              <div
                key={x.k}
                role="button"
                tabIndex={0}
                onKeyDown={pressKey(() => pickType(x))}
                onClick={() => pickType(x)}
                style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--card)", border: "1px solid var(--el)", borderLeft: `4px solid ${x.c}`, borderRadius: 14, padding: "12px 13px", marginBottom: 8, cursor: "pointer" }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 900 }}>{x.label}</div>
                  <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>{x.sub}</div>
                </div>
                <span style={{ fontSize: 16, color: "var(--muted)" }}>›</span>
              </div>
            ))}
            {allowed.length === 0 ? <div style={{ fontSize: 11.5, color: "var(--sub)", padding: "10px 2px" }}>They aren&apos;t taking enquiries right now.</div> : null}
          </>
        ) : (
          <>
            <div
              role="button"
              tabIndex={0}
              onKeyDown={pressKey(() => setType(null))}
              onClick={() => setType(null)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: "var(--sub)", cursor: "pointer", marginBottom: 6 }}
            >
              ‹ All types
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.2, color: type.c }}>{type.label.toUpperCase()}</div>
            <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 2 }}>Enquiry to {tenantName}</div>

            <Lab>{dateMode === "multi" ? "Event dates" : "Date of event"}</Lab>
            <div style={{ display: "flex", gap: 7, marginBottom: 8 }}>
              {(
                [
                  ["single", "Single date"],
                  ["multi", "Multiple dates"],
                ] as const
              ).map(([k, l]) => (
                <span
                  key={k}
                  role="button"
                  tabIndex={0}
                  onKeyDown={pressKey(() => {
                    setDateMode(k);
                    setDates(k === "single" ? [dates[0] || ""] : dates);
                  })}
                  onClick={() => {
                    setDateMode(k);
                    setDates(k === "single" ? [dates[0] || ""] : dates);
                  }}
                  style={toggle(dateMode === k)}
                >
                  {l}
                </span>
              ))}
            </div>
            {dates.map((d, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 7 }}>
                <input
                  type="date"
                  aria-label={dates.length > 1 ? `Date ${i + 1}` : "Date of event"}
                  value={d}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDates((a) => a.map((x, j) => (j === i ? v : x)));
                    setErr("");
                  }}
                  style={inp}
                />
                {dates.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Remove date ${i + 1}`}
                    onClick={() => setDates((a) => a.filter((_, j) => j !== i))}
                    style={{ width: 40, borderRadius: 12, background: "var(--el)", color: "#F87171", fontSize: 16, cursor: "pointer", border: "none", flexShrink: 0 }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
            {dateMode === "multi" ? (
              <div
                role="button"
                tabIndex={0}
                onKeyDown={pressKey(() => setDates((a) => [...a, ""]))}
                onClick={() => setDates((a) => [...a, ""])}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: type.c, cursor: "pointer" }}
              >
                ＋ Add another date
              </div>
            ) : null}

            {type.fields.map((f) => (
              <div key={f.k}>
                <Lab>{f.label}</Lab>
                {f.t === "select" ? (
                  <select aria-label={f.label} value={String(vals[f.k] ?? "")} onChange={(e) => setV(f.k, e.target.value)} style={{ ...inp, WebkitAppearance: "none", appearance: "none" }}>
                    <option value="">Choose…</option>
                    {f.opts.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : f.t === "count" ? (
                  <Count f={f} />
                ) : (
                  <input
                    aria-label="Event name"
                    value={eventName}
                    onChange={(e) => {
                      setEventName(e.target.value);
                      setErr("");
                    }}
                    placeholder="Event name"
                    style={inp}
                  />
                )}
              </div>
            ))}

            <Lab>Location</Lab>
            <input aria-label="Venue or address" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Venue / address details" style={{ ...inp, marginBottom: 8 }} />
            <div style={{ position: "relative" }}>
              <div
                role="button"
                tabIndex={0}
                aria-label="City"
                aria-expanded={cityOpen}
                onKeyDown={pressKey(() => setCityOpen((v) => !v))}
                onClick={() => setCityOpen((v) => !v)}
                style={{ ...inp, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
                <span style={{ flex: 1, color: city ? "var(--text)" : "var(--sub)" }}>{city || "Select city"}</span>
                <span style={{ fontSize: 11, color: "var(--sub)" }}>▾</span>
              </div>
              {cityOpen ? (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    right: 0,
                    zIndex: 40,
                    maxHeight: 190,
                    overflowY: "auto",
                    background: "var(--solid)",
                    border: "1px solid var(--el)",
                    borderRadius: 12,
                    padding: 6,
                    boxShadow: "0 10px 28px rgba(0,0,0,.45)",
                  }}
                >
                  {DOS_CITIES.map((c2) => (
                    <div
                      key={c2}
                      role="button"
                      tabIndex={0}
                      onKeyDown={pressKey(() => {
                        setCity(c2);
                        setCityOpen(false);
                        setErr("");
                      })}
                      onClick={() => {
                        setCity(c2);
                        setCityOpen(false);
                        setErr("");
                      }}
                      style={{ padding: "9px 10px", borderRadius: 9, cursor: "pointer", fontSize: 12.5, fontWeight: city === c2 ? 900 : 600, background: city === c2 ? "var(--el)" : "transparent" }}
                    >
                      {c2}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <Lab>Your number (optional)</Lab>
            <input aria-label="Your number" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+91 …  so they can call you back" inputMode="tel" style={inp} />

            <Lab>Message</Lab>
            <textarea
              aria-label="Message"
              value={msg}
              onChange={(e) => {
                setMsg(e.target.value);
                setErr("");
              }}
              rows={3}
              placeholder="Tell them what you have in mind…"
              style={{ ...inp, resize: "none" }}
            />
            {err ? <div style={{ fontSize: 10.5, color: "#F87171", fontWeight: 700, marginTop: 8 }}>{err}</div> : null}
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              style={{
                width: "100%",
                marginTop: 14,
                textAlign: "center",
                padding: 14,
                borderRadius: 999,
                background: "var(--text)",
                color: "var(--solid)",
                fontWeight: 900,
                fontSize: 14,
                cursor: busy ? "wait" : "pointer",
                border: "none",
                fontFamily: "inherit",
              }}
            >
              {busy ? "Sending…" : "Send enquiry"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
