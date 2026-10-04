"use client";

import Link from "next/link";
import { useState } from "react";
import { sendEnquiryAction } from "@/features/enquiries/server-actions/enquiries";
import { CONTACT_BOX, CONTACT_LABEL } from "@/features/profiles/components/ContactButtons";
import { DOS_UI } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { enquiryTypesFor, type EnquiryField, type EnquiryType, type SendableEnquiryTypeKey } from "@/types/enquiry";
import type { BusinessType } from "@/types/business";
import { EnqIcon, pressKey } from "@/features/inbox/components/inbox-kit";

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

/** One mark per option on a kind's tiles (4 Oct 2026, the user: "icons for these
 *  headings in the enquiry form as well"), drawn in the same line language as
 *  the kinds' own icons. An option with no mark draws none. */
const OPT_ICON: Record<string, React.ReactNode> = {
  /* a ticket — an occasion somebody goes to */
  Event: (
    <>
      <path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z" />
      <path d="M15 7.5v9" strokeDasharray="1.6 1.8" />
    </>
  ),
  /* a board on its easel — something taught */
  Classes: (
    <>
      <rect x="3.5" y="3.5" width="17" height="11" rx="1.6" />
      <path d="M7 8h6M7 11h9M12 14.5v2M8 21l4-4.5 4 4.5" />
    </>
  ),
  /* a camera — something filmed */
  Shoot: (
    <>
      <rect x="3" y="7" width="12" height="10" rx="2" />
      <path d="m15 10.5 6-3v9l-6-3z" />
    </>
  ),
  /* the score paddle, reading 10 */
  Judge: (
    <>
      <rect x="5" y="3" width="14" height="11.5" rx="2.6" />
      <path d="M9 7.1l1.4-1v5.6" />
      <ellipse cx="14.4" cy="8.9" rx="1.8" ry="2.8" />
      <path d="M12 14.5V21M9.6 21h4.8" />
    </>
  ),
  /* a microphone — a guest who appears, speaks, presents */
  Guest: (
    <>
      <rect x="9.5" y="3" width="5" height="10" rx="2.5" />
      <path d="M6.5 10.5a5.5 5.5 0 0 0 11 0M12 16v5M9 21h6" />
    </>
  ),
};

function OptIcon({ o, color }: { o: string; color: string }) {
  const d = OPT_ICON[o];
  if (!d) return null;
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-testid="enquiry-option-icon" style={{ display: "block", marginBottom: 5 }}>
      {d}
    </svg>
  );
}

/** "Events · Classes · Shoots" — each item kept whole on its line, so a narrow
 *  tile wraps BETWEEN items and never inside one ("Guest / appearances"). */
function DotLine({ text, style }: { text: string; style?: React.CSSProperties }) {
  const items = text.split(" · ");
  return (
    <div style={style}>
      {items.map((it, i) => (
        <span key={it}>
          <span style={{ whiteSpace: "nowrap" }}>
            {it}
            {i < items.length - 1 ? <span style={{ opacity: 0.55 }}>{" ·"}</span> : null}
          </span>
          {i < items.length - 1 ? " " : null}
        </span>
      ))}
    </div>
  );
}

function Lab({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)", margin: "12px 0 6px" }}>{children}</div>;
}

/** The round trigger + the sheet, in one client island so the server-rendered
 *  profile stays a server component. */
export function EnquiryButton({
  businessId,
  businessName,
  businessType,
  signedIn,
  accent,
  enquiryTypes = null,
  cannotAsk = null,
}: {
  /** the business asked — a studio or an artist page (⚠ never a crew since 4 Oct 2026) */
  businessId: string;
  businessName: string;
  businessType: BusinessType;
  signedIn: boolean;
  accent: string;
  /** the types the business switched on (ENQUIRIES YOU ACCEPT, 9005) — null means every one its kind allows */
  enquiryTypes?: string[] | null;
  /** ⚠ WHY THE PRESS WOULD BE REFUSED, WHEN IT WOULD (20 Sep 2026, the user:
   *  "Viewing your own profile should show same buttons which you see on
   *  discover it should look the same way"). Your own page used to DROP this
   *  button, so the page you reach from Home's eye had one fewer control than
   *  the same page reached from Discover — and `ActionRow` is a grid sized by
   *  how many cells it gets, so the remaining buttons changed width too. It is
   *  drawn and disabled with its reason on it, which is exactly what the Follow
   *  bell does for the same reason (C27, the user's own "should be available to
   *  all"). */
  cannotAsk?: string | null;
}) {
  const [open, setOpen] = useState(false);
  /* ⚠ ENQUIRY CAN BE TAKEN OFF A PAGE (26 Sep 2026, the user: "all buttons like
     … enquiry on home tab should also be … add or remove"). An EMPTY list of
     accepted types — every switch off, or the contact sheet's Enquiry switch —
     is a business that takes none, so no button is drawn rather than one that
     opens a sheet with nothing in it. Null still means every type its kind allows. */
  if (Array.isArray(enquiryTypes) && enquiryTypes.length === 0) return null;
  /* ⚠ ONE LITERAL (28 Sep 2026). This was a byte-identical copy of
     `CONTACT_BOX` — Enquiry is a cell of the same row and only lives in its own
     file because it opens a sheet. The copy is why it had to be found by hand
     when the labels stopped being cut: four buttons would have been fixed and
     the fifth would have gone on clipping. What stays local is the three things
     a BUTTON needs and an anchor does not. */
  const box: React.CSSProperties = { ...CONTACT_BOX, cursor: "pointer", width: "100%", fontFamily: "inherit" };
  const icon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8z" />
    </svg>
  );
  if (cannotAsk) {
    return (
      <button type="button" disabled aria-label={cannotAsk} title={cannotAsk} style={{ ...box, opacity: 0.45, cursor: "not-allowed" }}>
        <span style={{ flexShrink: 0, lineHeight: 0, color: "var(--sub)" }}>{icon}</span>
        <span style={CONTACT_LABEL}>Enquiry</span>
      </button>
    );
  }
  if (!signedIn) {
    return (
      <Link href="/login" aria-label="Enquiry" style={box}>
        <span style={{ flexShrink: 0, lineHeight: 0, color: "var(--sub)" }}>{icon}</span>
        <span style={CONTACT_LABEL}>Enquiry</span>
      </Link>
    );
  }
  return (
    <>
      <button type="button" aria-label="Enquiry" onClick={() => setOpen(true)} style={box}>
        <span style={{ flexShrink: 0, lineHeight: 0, color: "var(--sub)" }}>{icon}</span>
        <span style={CONTACT_LABEL}>Enquiry</span>
      </button>
      {open ? (
        <EnquirySheet businessId={businessId} businessName={businessName} businessType={businessType} accent={accent} enquiryTypes={enquiryTypes} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

export function EnquirySheet({
  businessId,
  businessName,
  businessType,
  onClose,
  enquiryTypes = null,
}: {
  businessId: string;
  businessName: string;
  businessType: BusinessType;
  enquiryTypes?: string[] | null;
  /** the business page's colour — the sheet wears each TYPE's own colour instead (5119), so this is accepted and unused */
  accent?: string;
  onClose: () => void;
}) {
  useCloseOnBack(onClose);
  /* only the types the business switched on appear (9007) */
  const allowed = enquiryTypesFor(businessType).filter((t) => !enquiryTypes || enquiryTypes.includes(t.k));
  const [type, setType] = useState<EnquiryType<SendableEnquiryTypeKey> | null>(null);
  const [dates, setDates] = useState<string[]>([""]);
  const [vals, setVals] = useState<Record<string, string | number>>({});
  const [eventName, setEventName] = useState("");
  const [where, setWhere] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  /* ⚠ BACK STEPS OUT OF A KIND BEFORE IT LEAVES THE SHEET (4 Oct 2026, the user:
     "when swiping back inside form should take back to the previous section in
     enquiry"). A chosen kind owns a history entry of its own on top of the
     sheet's, so the first back returns to "What's it for?" and only the second
     closes. Sending spends that entry (the "Enquiry sent" screen is the
     sheet's own, and its Done closes the sheet). ⚠ There is no "‹ All types"
     button any more (the user: "remove all types back button from the form") —
     back is the way out of a kind. */
  useCloseOnBack(() => setType(null), type !== null && !sent);

  const setV = (k: string, v: string | number) => {
    setVals((o) => ({ ...o, [k]: v }));
    setErr("");
  };
  const pickType = (t: EnquiryType<SendableEnquiryTypeKey>) => {
    setType(t);
    setDates([""]);
    setVals({});
    setErr("");
  };

  /* ⚠⚠ SHORTER (2 Oct 2026, the user: "shorter forms for every kind of
     enquiry"). What it asks now: the kind, a date, the kind's one or two own
     questions (chips — one tap each, never a sheet over the sheet), and three
     optional lines. Gone: the Single/Multiple toggle (one date, "＋ another date"
     when there are more), the separate venue box AND the city search (one
     "Where" line — `where_text` was always free text), and a REQUIRED message
     (the database wants one, so an empty box sends a sentence built from the
     answers, which says exactly what the form already knows). */
  const submit = async () => {
    if (!type || busy) return;
    const cleanDates = dates.filter(Boolean);
    if (!cleanDates.length) return setErr("Pick a date");
    const missing = type.fields.find((f) => f.t === "select" && !vals[f.k]);
    if (missing) return setErr(`Choose ${missing.label.toLowerCase()}`);
    if (type.k === "judge" && !eventName.trim()) return setErr("Name the event");

    const rows: Array<[string, string]> = [["Enquiry", type.label]];
    if (type.k === "judge") rows.push(["Event", eventName.trim()]);
    type.fields.forEach((f) => {
      if (f.t === "event") return;
      const v = vals[f.k] !== undefined ? vals[f.k] : f.t === "count" ? f.def : "";
      if (v !== "") rows.push([f.label, String(v)]);
    });
    const said = rows.slice(1).map(([, v]) => v).join(", ");
    const message = msg.trim() || `${type.label}${said ? ` — ${said}` : ""}.`;

    setBusy(true);
    const out = await sendEnquiryAction({
      businessId,
      typeKey: type.k,
      fields: rows,
      dates: cleanDates,
      whereText: where.trim() || null,
      message,
    });
    setBusy(false);
    if (out.error) return setErr(out.error);
    setSent(true);
  };

  const Count = ({ f }: { f: Extract<EnquiryField, { t: "count" }> }) => {
    const v = Number(vals[f.k] !== undefined ? vals[f.k] : f.def);
    const step = (d: number) => setV(f.k, Math.min(f.max, Math.max(f.min, v + d)));
    const btn: React.CSSProperties = {
      width: 32,
      height: 32,
      borderRadius: 16,
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 12, padding: "7px 10px" }}>
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
        aria-label={`Enquiry to ${businessName}`}
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
              {businessName} will reply in your Enquiries.
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
            <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 2 }}>What&apos;s it for?</div>
            <div style={{ fontSize: 11, color: "var(--sub)", marginBottom: 12 }}>To {businessName}</div>
            {/* one row: a studio is offered two kinds, an artist three (4 Oct 2026) */}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, Math.min(allowed.length, 3))}, minmax(0, 1fr))`, gap: 8 }}>
              {allowed.map((x) => (
                <div
                  key={x.k}
                  role="button"
                  tabIndex={0}
                  onKeyDown={pressKey(() => pickType(x))}
                  onClick={() => pickType(x)}
                  style={{ background: "var(--card)", border: `1.5px solid ${x.c}55`, borderRadius: 14, padding: "12px 12px", cursor: "pointer" }}
                >
                  <span style={{ width: 30, height: 30, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `${x.c}1f` }}>
                    <EnqIcon k={x.k} size={16} color={x.c} sw={2} />
                  </span>
                  <div style={{ fontSize: 13, fontWeight: 900, marginTop: 7 }}>{x.label}</div>
                  <DotLine text={x.sub} style={{ fontSize: 10.5, fontWeight: 700, color: "var(--sub)", marginTop: 3, lineHeight: 1.45 }} />
                </div>
              ))}
            </div>
            {allowed.length === 0 ? <div style={{ fontSize: 11.5, color: "var(--sub)", padding: "10px 2px" }}>They aren&apos;t taking enquiries right now.</div> : null}
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <EnqIcon k={type.k} size={16} color={type.c} sw={2} />
              <div style={{ fontSize: 17, fontWeight: 900 }}>{type.label}</div>
            </div>
            {/* the kind's own line, the same words its tile says (4 Oct 2026) */}
            <div data-testid="enquiry-kind-sub">
              <DotLine text={type.sub} style={{ fontSize: 12, color: "var(--text)", fontWeight: 700, marginTop: 3, lineHeight: 1.45 }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 2 }}>To {businessName}</div>

            <Lab>{dates.length > 1 ? "Dates" : "Date"}</Lab>
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
            <div
              role="button"
              tabIndex={0}
              onKeyDown={pressKey(() => setDates((a) => [...a, ""]))}
              onClick={() => setDates((a) => [...a, ""])}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: type.c, cursor: "pointer" }}
            >
              ＋ Another date
            </div>

            {type.fields.map((f) => (
              <div key={f.k}>
                <Lab>{f.label}</Lab>
                {f.t === "select" && f.points ? (
                  /* ⚠ AN OPTION THAT CLUBS SEVERAL TOGETHER SAYS WHAT IT COVERS (4 Oct
                     2026) — "Event" alone does not tell somebody whether their sangeet
                     is one. One tile per option, what it covers as a short list of
                     points under it (one per line, a dot before each — the user asked
                     for points, not a sentence); the accessible name stays the
                     option's own word so a locator finds "Event". */
                  <div role="group" aria-label={f.label} style={{ display: "grid", gridTemplateColumns: `repeat(${f.opts.length}, minmax(0, 1fr))`, gap: 6 }}>
                    {f.opts.map((o, i) => {
                      const on = vals[f.k] === o;
                      return (
                        <button
                          key={o}
                          type="button"
                          aria-pressed={on}
                          aria-label={o}
                          onClick={() => setV(f.k, o)}
                          /* a <button> centres its content vertically, so a tile with
                             three points sat lower than its four-point neighbours —
                             a column from the top keeps every title on one line */
                          style={{ display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "flex-start", padding: "9px 8px", borderRadius: 12, textAlign: "left", cursor: "pointer", fontFamily: "inherit", background: on ? type.c : "var(--card)", color: on ? "#08060C" : "var(--text)", border: `1.5px solid ${on ? type.c : "var(--el)"}` }}
                        >
                          <OptIcon o={o} color={on ? "#08060C" : type.c} />
                          <div style={{ fontSize: 12.5, fontWeight: 900 }}>{o}</div>
                          <ul data-testid="enquiry-option-points" style={{ listStyle: "none", margin: "5px 0 0", padding: 0, display: "grid", gap: 2 }}>
                            {(f.points?.[i] ?? []).map((pt) => (
                              <li key={pt} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 650, lineHeight: 1.3, color: on ? "#08060C" : "var(--sub)" }}>
                                <span aria-hidden style={{ width: 4, height: 4, borderRadius: 2, flexShrink: 0, background: on ? "#08060C" : type.c }} />
                                {pt}
                              </li>
                            ))}
                          </ul>
                        </button>
                      );
                    })}
                  </div>
                ) : f.t === "select" ? (
                  <div role="group" aria-label={f.label} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {f.opts.map((o) => {
                      const on = vals[f.k] === o;
                      return (
                        <button
                          key={o}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setV(f.k, o)}
                          style={{ padding: "7px 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", background: on ? type.c : "var(--card)", color: on ? "#08060C" : "var(--sub)", border: `1.5px solid ${on ? type.c : "var(--el)"}` }}
                        >
                          {o}
                        </button>
                      );
                    })}
                  </div>
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

            <Lab>Where (optional)</Lab>
            <input aria-label="Where" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Venue, area, city" style={inp} />

            <Lab>Anything else (optional)</Lab>
            <textarea
              aria-label="Message"
              value={msg}
              onChange={(e) => {
                setMsg(e.target.value);
                setErr("");
              }}
              rows={2}
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
