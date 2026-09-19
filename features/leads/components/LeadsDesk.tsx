"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { dosKey } from "@/features/classes/components/ShareSheet";
import {
  createLeadAction,
  deleteLeadAction,
  updateLeadAction,
} from "@/features/leads/server-actions/leads";
import { PeoplePicker } from "@/features/people/components/PeoplePicker";
import { DOS_TOOLS, dosToolPaint } from "@/features/tenants/components/biz-kit";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { photoUrl } from "@/lib/media/photo";
import type { DanceClass } from "@/types/class";
import { LEAD_SOURCES, LEAD_STAGES, LEAD_TINT, type Lead, type LeadStatus, type StudentStats } from "@/types/lead";

/** The students desk — the studio's leads, lifted from the prototype's enquiry
 *  desk shape (DanceOSApp.jsx:5894-6000): the funnel summary, the stage chip row
 *  (5978) in its own words and tints (5664), and one row per person. A lead is a
 *  private business record, so this screen exists only inside the studio. */

const CARD = "var(--card)";
const EL = "var(--el)";
const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: CARD,
  border: `1.5px solid ${EL}`,
  borderRadius: 12,
  padding: "11px 12px",
  fontSize: 13,
  color: INK,
  outline: "none",
  fontFamily: "inherit",
};

const stageWord = (s: LeadStatus) => LEAD_STAGES.find(([k]) => k === s)?.[1] ?? s;

/** "4 h ago" / "2 d ago" — the prototype prints a lead's age, not its timestamp. */
const agoText = (iso: string, now: number): string => {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days} d ago` : `${Math.round(days / 7)} w ago`;
};

export function LeadsDesk({
  tenantId,
  tenantName,
  leads,
  stats = {},
  classes,
  /** Stamped on the server so the row ages never recompute mid-render. */
  now,
}: {
  tenantId: string;
  tenantName: string;
  leads: Lead[];
  /** what each student who is on DanceOS has booked and turned up to here */
  stats?: Record<string, StudentStats>;
  classes: DanceClass[];
  now: number;
}) {
  const [stage, setStage] = useState<LeadStatus | "all">("all");
  const [addOpen, setAddOpen] = useState(false);
  /* the two ways a student gets on the list (19 Sep 2026, the user: "Students —
     adding same way as for Team"): pick somebody on DanceOS, or type a walk-in */
  const [addBy, setAddBy] = useState<"person" | "typed">("person");
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /* the search and the sort (17401-17412): A–Z, or most recently touched first */
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"name" | "active">("active");
  const [dir, setDir] = useState<"desc" | "asc">("desc");

  const [form, setForm] = useState({ name: "", mobile: "", interest: "", source: "walk_in", note: "" });

  /* system back closes the sheet that is open, exactly as tapping the scrim does */
  useCloseOnBack(() => setAddOpen(false), addOpen);
  useCloseOnBack(() => setOpenLead(null), Boolean(openLead));

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };

  const run = async (op: () => Promise<{ error: string | null }>, doneMsg: string | null) => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const out = await op();
    setBusy(false);
    if (out.error) {
      setError(out.error);
      return false;
    }
    if (doneMsg) fire(doneMsg);
    return true;
  };

  const qn = q.trim().toLowerCase();
  const shown = (stage === "all" ? leads : leads.filter((l) => l.status === stage))
    .filter((l) => !qn || l.name.toLowerCase().includes(qn) || (l.interest ?? "").toLowerCase().includes(qn))
    .sort((a, b) => {
      const v = sort === "name" ? a.name.localeCompare(b.name) : b.createdAt.localeCompare(a.createdAt);
      return dir === "desc" ? v : -v;
    });
  const countOf = (s: LeadStatus) => leads.filter((l) => l.status === s).length;
  const open = leads.filter((l) => l.status === "new" || l.status === "quoted" || l.status === "trial_booked");
  const won = countOf("converted");
  /* the funnel the prototype summarises: how many came in, how many stuck */
  const conversion = leads.length > 0 ? Math.round((100 * won) / leads.length) : 0;

  return (
    <div
      style={{
        background: LILAC,
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        minHeight: "100vh",
        padding: "8px 16px 40px",
        boxSizing: "border-box",
      }}
    >
      {/* BizShell's hero (2964-2976): the tile's paint, the tool's name, nothing else */}
      {/* ⚠ reads the tool's own colour (18 Sep 2026) — it hardcoded #8B5CF6, so
          when the palette moved Students to lime the tile and its page disagreed */}
      <div aria-label={`${tenantName} — Students`} style={{ borderRadius: 22, padding: "15px 17px 14px", marginBottom: 12, position: "relative", overflow: "hidden", color: "#fff", background: dosToolPaint(DOS_TOOLS.students.c) }}>
        <div aria-hidden="true" style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, position: "relative", fontFamily: DOS_DISPLAY, lineHeight: 1.18 }}>Students</div>
      </div>

      {/* the funnel, in one line: what is open, and what stuck */}
      <div style={{ background: CARD, borderRadius: 16, padding: "12px 14px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)" }}>OPEN LEADS</div>
            <div style={{ fontSize: 26, fontWeight: 900, fontFamily: DOS_DISPLAY, letterSpacing: -1, lineHeight: 1.1 }}>
              {open.length}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)" }}>ENROLLED</div>
            <div style={{ fontSize: 15, fontWeight: 900, fontFamily: DOS_MONO, color: LEAD_TINT.converted }}>
              {won}
              {leads.length > 0 && (
                <span style={{ fontSize: 11, color: SUB, fontWeight: 700 }}> · {conversion}%</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={dosKey}
        aria-label="Add a lead"
        onClick={() => {
          setForm({ name: "", mobile: "", interest: "", source: "walk_in", note: "" });
          setAddOpen(true);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          background: INK,
          color: LILAC,
          borderRadius: 999,
          padding: "13px",
          fontWeight: 900,
          fontSize: 13.5,
          cursor: "pointer",
          marginBottom: 12,
        }}
      >
        ＋ Add a lead
      </div>

      {/* the search (17401) and the sort strip (17406) — A–Z · Active; Attendance and
          Progress wait for the attendance and progress figures a student record holds */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: CARD, border: `1px solid ${EL}`, borderRadius: 12, padding: "9px 11px", marginBottom: 9 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people or styles…" aria-label="Search people or styles" style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: INK, fontSize: 12.5, fontFamily: "inherit" }} />
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {(
          [
            ["name", "A–Z"],
            ["active", "Active"],
          ] as Array<["name" | "active", string]>
        ).map(([k, l]) => (
          <span key={k} role="button" tabIndex={0} onKeyDown={dosKey} aria-pressed={sort === k} onClick={() => setSort(k)} style={{ flex: 1, textAlign: "center", padding: "6px 3px", borderRadius: 10, cursor: "pointer", fontSize: 10, fontWeight: 800, background: sort === k ? EL : "transparent", color: sort === k ? INK : "var(--muted)", border: `1px solid ${sort === k ? INK : EL}` }}>
            {l}
          </span>
        ))}
        <span role="button" tabIndex={0} onKeyDown={dosKey} aria-label="Sort direction" onClick={() => setDir((d) => (d === "desc" ? "asc" : "desc"))} style={{ width: 34, textAlign: "center", padding: "6px 0", borderRadius: 10, cursor: "pointer", fontSize: 11, fontWeight: 900, background: EL, border: `1px solid ${EL}` }}>
          {dir === "desc" ? "↓" : "↑"}
        </span>
      </div>

      {/* the stage chips, in the prototype's order and words (5978) */}
      <div style={{ display: "flex", gap: 5, marginBottom: 10, overflowX: "auto", scrollbarWidth: "none" }}>
        {([["all", "Any stage"], ...LEAD_STAGES] as Array<[LeadStatus | "all", string]>).map(([k, l]) => {
          const on = stage === k;
          const n = k === "all" ? leads.length : countOf(k as LeadStatus);
          return (
            <span
              role="button"
              tabIndex={0}
              onKeyDown={dosKey}
              key={k}
              onClick={() => setStage(k)}
              style={{
                flexShrink: 0,
                padding: "7px 12px",
                borderRadius: 999,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 800,
                background: on ? INK : CARD,
                color: on ? LILAC : SUB,
                border: `1px solid ${on ? INK : EL}`,
              }}
            >
              {l}
              <span style={{ fontFamily: DOS_MONO, fontSize: 9.5, opacity: 0.8, marginLeft: 5 }}>{n}</span>
            </span>
          );
        })}
      </div>

      {shown.map((lead) => (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={dosKey}
          key={lead.id}
          aria-label={`Open ${lead.name}`}
          onClick={() => setOpenLead(lead)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            background: CARD,
            borderRadius: 14,
            padding: "11px 13px",
            marginBottom: 8,
            cursor: "pointer",
            borderLeft: `3px solid ${LEAD_TINT[lead.status]}`,
          }}
        >
          {/* ⚠ THE FACE IS THE DOOR TO THEIR PROFILE (19 Sep 2026, the user:
              "photo stats, name and profile on clicking") — for a student who
              IS somebody on DanceOS. A walk-in typed at the desk has no page,
              so their square is the initials it always was. The link stops the
              press from also opening the lead sheet, which is what the rest of
              the row does. */}
          {(() => {
            const face = photoUrl(lead.avatarPath);
            const square = (
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  flexShrink: 0,
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11.5,
                  fontWeight: 900,
                  color: "#fff",
                  background: `linear-gradient(135deg,${LEAD_TINT[lead.status]},#7C3AED)`,
                }}
              >
                {face ? <Image src={face} alt="" width={34} height={34} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : lead.name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}
              </span>
            );
            return lead.userId ? (
              <Link href={`/person/${lead.userId}`} aria-label={`Open ${lead.name}'s profile`} onClick={(e) => e.stopPropagation()} style={{ display: "block", flexShrink: 0, textDecoration: "none" }}>
                {square}
              </Link>
            ) : (
              square
            );
          })()}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lead.name}
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: SUB,
                marginTop: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {[lead.interest, stageWord(lead.status).toLowerCase()].filter(Boolean).join(" · ")}
              {lead.status === "trial_booked" && lead.trialClassTitle ? ` · ${lead.trialClassTitle}` : ""}
            </div>
            {/* WHAT THEY HAVE ACTUALLY DONE HERE — counted, and only when there
                is a record to count. Attended is CHECK-INS, not bookings. */}
            {lead.userId && stats[lead.userId] ? (
              <div style={{ fontSize: 9.5, fontWeight: 800, color: "var(--muted)", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                {stats[lead.userId].booked} booked · {stats[lead.userId].attended} attended
              </div>
            ) : null}
          </div>
          <span style={{ flexShrink: 0, fontSize: 9.5, color: "var(--muted)", fontFamily: DOS_MONO }}>
            {agoText(lead.createdAt, now)}
          </span>
        </div>
      ))}

      {shown.length === 0 && (
        <div
          style={{
            background: CARD,
            border: `1.5px dashed ${EL}`,
            borderRadius: 16,
            padding: "22px 16px",
            textAlign: "center",
          }}
        >
          {leads.length === 0 ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 5 }}>No students yet</div>
              <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.5 }}>Anyone who books one of your classes lands here, with their attendance and what they have paid — and anyone who asks at the desk is added above.</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>{qn ? `Nobody matching “${q.trim()}”` : "Nobody in that group"}</div>
              <span
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                onClick={() => {
                  setQ("");
                  setStage("all");
                }}
                style={{ display: "inline-block", padding: "8px 16px", borderRadius: 999, cursor: "pointer", fontSize: 11.5, fontWeight: 800, background: EL, color: INK }}
              >
                Show everyone
              </span>
            </>
          )}
        </div>
      )}

      {error && <div style={{ fontSize: 11.5, color: "#EF4444", fontWeight: 700, marginTop: 10 }}>{error}</div>}

      {/* ── add a lead ── */}
      {addOpen && (
        <div
          onClick={() => setAddOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.6)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 610,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add a lead"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--solid)",
              color: "var(--text)",
              borderRadius: "24px 24px 0 0",
              padding: "18px 16px 28px",
              width: "100%",
              maxWidth: 430,
              boxSizing: "border-box",
              maxHeight: "88vh",
              overflowY: "auto",
              fontFamily: DOS_UI,
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: EL, margin: "0 auto 12px" }} />
            <b style={{ fontSize: 17, fontFamily: DOS_DISPLAY }}>Add a lead</b>
            <div style={{ fontSize: 11.5, color: SUB, margin: "3px 0 14px" }}>
              Someone who asked about classes. You can move them along as things happen.
            </div>

            {/* ── THE TWO WAYS ONTO THE LIST (19 Sep 2026, the user: "Students —
                adding same way as for Team"). Somebody on DanceOS is PICKED, so
                the row carries their picture, opens their profile and counts
                what they have actually done here; a walk-in is typed, and is
                still a real student with none of those. ── */}
            <div style={{ display: "flex", gap: 2, background: EL, borderRadius: 12, padding: 3, marginBottom: 12 }}>
              {([["person", "On DanceOS"], ["typed", "Walk-in"]] as const).map(([k, word]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={addBy === k}
                  onClick={() => setAddBy(k)}
                  style={{ flex: 1, padding: "8px 2px", borderRadius: 9, fontSize: 11.5, fontWeight: 800, border: "none", cursor: "pointer", fontFamily: "inherit", background: addBy === k ? "var(--solid)" : "transparent", color: addBy === k ? INK : SUB }}
                >
                  {word}
                </button>
              ))}
            </div>

            {addBy === "person" ? (
              <PeoplePicker
                title="Search DanceOS, then add them"
                placeholder="Name or mobile number"
                ariaLabel="Search for a student"
                actionWord="Add"
                actionColor={LEAD_TINT.new}
                exclude={leads.map((l) => l.userId).filter((x): x is string => Boolean(x))}
                pickLabel={(p) => `Add ${p.fullName}`}
                onPick={async (p) => {
                  const done = await run(
                    () =>
                      createLeadAction({
                        tenantId,
                        name: p.fullName,
                        /* their number is theirs to publish — the desk keeps
                           what is already public and asks for nothing more */
                        mobile: p.phone ?? null,
                        interest: null,
                        source: "walk_in",
                        note: null,
                        userId: p.id,
                      }),
                    `${p.fullName} added`
                  );
                  if (done) setAddOpen(false);
                }}
              />
            ) : (
            <>
            <div style={{ fontSize: 12, color: SUB, margin: "0 0 4px" }}>Name</div>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Priya Iyer"
              aria-label="Lead name"
              style={inputStyle}
            />
            <div style={{ fontSize: 12, color: SUB, margin: "12px 0 4px" }}>Mobile</div>
            <input
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              placeholder="+91 ·········"
              inputMode="tel"
              aria-label="Lead mobile"
              style={inputStyle}
            />
            <div style={{ fontSize: 12, color: SUB, margin: "12px 0 4px" }}>What they want</div>
            <input
              value={form.interest}
              onChange={(e) => setForm({ ...form, interest: e.target.value })}
              placeholder="e.g. Hip-Hop, evenings"
              aria-label="What they want"
              style={inputStyle}
            />
            <div style={{ fontSize: 12, color: SUB, margin: "12px 0 4px" }}>How they found you</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {LEAD_SOURCES.map(([k, word]) => {
                const on = form.source === k;
                return (
                  <span
                    role="button"
                    tabIndex={0}
                    onKeyDown={dosKey}
                    key={k}
                    aria-pressed={on}
                    onClick={() => setForm({ ...form, source: k })}
                    style={{
                      fontSize: 11.5,
                      fontWeight: 800,
                      padding: "7px 12px",
                      borderRadius: 999,
                      cursor: "pointer",
                      background: on ? "var(--text)" : CARD,
                      color: on ? "var(--solid)" : SUB,
                      border: `1px solid ${on ? "var(--text)" : EL}`,
                    }}
                  >
                    {word}
                  </span>
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: SUB, margin: "12px 0 4px" }}>Note</div>
            <textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              rows={2}
              placeholder="Anything the desk should remember"
              aria-label="Note"
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <div
              role="button"
              tabIndex={0}
              onKeyDown={dosKey}
              aria-label="Save lead"
              onClick={async () => {
                if (!form.name.trim()) return;
                const done = await run(
                  () =>
                    createLeadAction({
                      tenantId,
                      name: form.name,
                      mobile: form.mobile,
                      interest: form.interest,
                      source: form.source,
                      note: form.note,
                    }),
                  `${form.name.trim()} added`
                );
                if (done) setAddOpen(false);
              }}
              style={{
                marginTop: 14,
                textAlign: "center",
                padding: "13px",
                borderRadius: 999,
                background: form.name.trim() ? "var(--text)" : EL,
                color: form.name.trim() ? "var(--solid)" : "var(--muted)",
                fontWeight: 800,
                fontSize: 13.5,
                cursor: form.name.trim() ? "pointer" : "default",
              }}
            >
              {busy ? "Saving…" : "Save lead"}
            </div>
            </>
            )}
          </div>
        </div>
      )}

      {/* ── one lead: move it along ── */}
      {openLead && (
        <div
          onClick={() => setOpenLead(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.6)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 610,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={openLead.name}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--solid)",
              color: "var(--text)",
              borderRadius: "24px 24px 0 0",
              padding: "18px 16px 28px",
              width: "100%",
              maxWidth: 430,
              boxSizing: "border-box",
              maxHeight: "88vh",
              overflowY: "auto",
              fontFamily: DOS_UI,
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: EL, margin: "0 auto 12px" }} />
            <b style={{ fontSize: 17, fontFamily: DOS_DISPLAY }}>{openLead.name}</b>
            <div style={{ fontSize: 11.5, color: SUB, margin: "3px 0 12px" }}>
              {[openLead.mobile, openLead.interest].filter(Boolean).join(" · ") || "No details yet"}
            </div>
            {openLead.note && (
              <div
                style={{
                  background: CARD,
                  border: `1px solid ${EL}`,
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 12,
                  color: SUB,
                  marginBottom: 12,
                  lineHeight: 1.5,
                }}
              >
                {openLead.note}
              </div>
            )}

            <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.1, color: "var(--muted)", marginBottom: 7 }}>
              WHERE THEY ARE
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {LEAD_STAGES.map(([k, word]) => {
                const on = openLead.status === k;
                return (
                  <span
                    role="button"
                    tabIndex={0}
                    onKeyDown={dosKey}
                    key={k}
                    aria-pressed={on}
                    aria-label={`Move to ${word}`}
                    onClick={async () => {
                      if (on) return;
                      const done = await run(
                        () => updateLeadAction({ tenantId, leadId: openLead.id, status: k }),
                        `${openLead.name} → ${word}`
                      );
                      if (done) setOpenLead({ ...openLead, status: k });
                    }}
                    style={{
                      fontSize: 11.5,
                      fontWeight: 800,
                      padding: "7px 12px",
                      borderRadius: 999,
                      cursor: "pointer",
                      background: on ? LEAD_TINT[k] : CARD,
                      color: on ? "#fff" : SUB,
                      border: `1px solid ${on ? LEAD_TINT[k] : EL}`,
                    }}
                  >
                    {word}
                  </span>
                );
              })}
            </div>

            {/* a trial is a desk agreement: which class, which day. The learner
                still books their own seat — the studio cannot take it for them. */}
            {openLead.status === "trial_booked" && (
              <>
                <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.1, color: "var(--muted)", marginBottom: 7 }}>
                  THE TRIAL
                </div>
                <select
                  value={openLead.trialClassId ?? ""}
                  aria-label="Trial class"
                  onChange={async (e) => {
                    const value = e.target.value || null;
                    const done = await run(
                      () => updateLeadAction({ tenantId, leadId: openLead.id, trialClassId: value }),
                      "Trial class set"
                    );
                    if (done) {
                      setOpenLead({
                        ...openLead,
                        trialClassId: value,
                        trialClassTitle: classes.find((c) => c.id === value)?.title ?? null,
                      });
                    }
                  }}
                  style={{ ...inputStyle, appearance: "none", cursor: "pointer", color: "var(--text)", background: CARD }}
                >
                  <option value="">Which class?</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
                  They book the seat themselves from the class&rsquo;s link — this is the desk&rsquo;s note that
                  they said they would come.
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <span
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                aria-label={`Remove ${openLead.name}`}
                onClick={async () => {
                  const done = await run(
                    () => deleteLeadAction({ tenantId, leadId: openLead.id }),
                    `${openLead.name} removed`
                  );
                  if (done) setOpenLead(null);
                }}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "12px",
                  borderRadius: 999,
                  background: CARD,
                  border: `1px solid ${EL}`,
                  fontWeight: 800,
                  fontSize: 12.5,
                  cursor: "pointer",
                  color: "#F87171",
                }}
              >
                Remove
              </span>
              <span
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                onClick={() => setOpenLead(null)}
                style={{
                  flex: 1.3,
                  textAlign: "center",
                  padding: "12px",
                  borderRadius: 999,
                  background: "var(--text)",
                  color: "var(--solid)",
                  fontWeight: 900,
                  fontSize: 12.5,
                  cursor: "pointer",
                }}
              >
                Done
              </span>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status" aria-live="polite" style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", boxShadow: "0 6px 24px rgba(0,0,0,.45)", color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650 }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
