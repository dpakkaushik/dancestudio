"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideReportAction } from "@/features/admin/server-actions/moderation";
import { INK, SUB } from "@/lib/design/tokens";
import type { AdminReport, ReportCounts, ReportReason } from "@/repositories/adminPanel";
import { agoWords } from "@/types/notification";
import { AdminGlyph, DESK_TINT } from "./admin-glyphs";
import { CountLine, DeskHero, Pager, StatStrip } from "./desk-kit";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";
const btn: React.CSSProperties = { height: 32, padding: "0 11px", borderRadius: 10, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${EL}`, background: CARD, color: INK };

/** The closed list of reasons, in the words a person would use. */
export const REASON_WORDS: Record<ReportReason, string> = {
  impersonation: "Pretending to be someone else",
  not_a_real_business: "Not a real business",
  stolen_content: "Using someone else's photos or videos",
  offensive: "Offensive",
  spam: "Spam",
  unsafe: "Unsafe",
  other: "Something else",
};

const KIND_WORDS: Record<AdminReport["subjectKind"], string> = {
  tenant: "business",
  profile: "person",
  crew: "crew",
  event: "event",
  class: "class",
};

/** THE REPORTS QUEUE (10 Sep 2026). Somebody said one thing is wrong with one
 *  other thing; this is where a person decides about it.
 *
 *  Two things the design insists on. The count of OTHER people who reported the
 *  same subject is on every card, because one complaint and nine are different
 *  situations and a queue sorted by time hides that. And answering a report
 *  ALWAYS tells the reporter — a report that vanishes silently teaches people
 *  not to bother reporting, which is how moderation dies.
 *
 *  Answering is not the same as acting: unlisting the business or suspending
 *  the account are their own decisions, on their own screens, each separately
 *  audited. This screen closes the report and says what was done. */
export function ReportsQueue({
  reports,
  status,
  counts,
  page,
  total,
  nowIso,
}: {
  /** ONE PAGE of reports in the state the tab shows */
  reports: AdminReport[];
  status: string;
  counts: ReportCounts;
  page: number;
  total: number;
  nowIso: string;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);
  const [actioned, setActioned] = useState(true);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  };

  const answer = (r: AdminReport) =>
    start(async () => {
      const out = await decideReportAction({ reportId: r.id, actioned, note: note.trim() || null });
      if (out.error) return fire(out.error);
      setAnswering(null);
      setNote("");
      fire(actioned ? "Marked as acted on — the reporter has been told" : "Dismissed — the reporter has been told");
      router.refresh();
    });

  const open = counts.open;
  const all = counts.open + counts.actioned + counts.dismissed;
  const base = "/admin/reports";

  return (
    <div style={{ padding: "6px 16px var(--dos-foot, 40px)" }}>
      {/* THE DESK SHAPE (11 Sep 2026): figures, tabs as blocks with their own
          counts, one page of the list, a pager — the same object every other
          desk is now, so an admin learns it once */}
      <DeskHero
        eyebrow="MODERATION"
        title="Reports"
        sub={open > 0 ? `${open} waiting on a person` : "nothing waiting"}
        tint={open > 0 ? DESK_TINT.reports : "#22C55E"}
        icon={<AdminGlyph k="reports" size={22} />}
      />
      <StatStrip
        cols={4}
        figs={[
          { n: counts.open, label: "waiting", href: `${base}?status=open`, tone: counts.open > 0 ? "#EF4444" : undefined },
          { n: counts.actioned, label: "acted on", href: `${base}?status=actioned`, tone: "#22C55E" },
          { n: counts.dismissed, label: "no problem found", href: `${base}?status=dismissed` },
          { n: all, label: "reports ever", href: `${base}?status=all` },
        ]}
      />
      {/* the tab is `?status=`, the word the URL has always used here */}
      <div role="tablist" style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(
          [
            ["open", "Open", counts.open, "#EF4444"],
            ["actioned", "Acted on", counts.actioned, undefined],
            ["dismissed", "Dismissed", counts.dismissed, undefined],
            ["all", "All", all, undefined],
          ] as Array<[string, string, number, string | undefined]>
        ).map(([s, label, n, tone]) => {
          const on = status === s;
          return (
            <Link key={s} role="tab" aria-selected={on} href={`${base}?status=${s}`} style={{ flex: 1, minWidth: 0, textAlign: "center", padding: "9px 4px 8px", borderRadius: 14, textDecoration: "none", background: on ? "var(--text)" : CARD, color: on ? "var(--solid)" : SUB, border: `1.5px solid ${on ? "var(--text)" : EL}` }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
              <div style={{ fontSize: 12, fontWeight: 900, marginTop: 2, fontVariantNumeric: "tabular-nums", color: on ? "var(--solid)" : n > 0 && tone ? tone : SUB }}>{n}</div>
            </Link>
          );
        })}
      </div>
      <CountLine shown={reports.length} total={total} what={status === "all" ? "reports" : `${status === "open" ? "open" : status} report${total === 1 ? "" : "s"}`} />

      {reports.length === 0 ? (
        <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.55, padding: "0 2px" }}>
          {status === "open"
            ? "Nothing reported. The Report control sits on every public business and person page, so this fills up on its own when something is wrong."
            : "Nothing here."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {reports.map((r) => {
            const isOpen = r.status === "open";
            return (
              <div key={r.id} data-testid="report-card" style={{ background: CARD, border: `1px solid ${EL}`, borderLeft: `4px solid ${isOpen ? (r.others > 0 ? "#EF4444" : "#F59E0B") : r.status === "actioned" ? "#22C55E" : MUTED}`, borderRadius: 16, padding: "11px 12px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                  <b style={{ fontSize: 13 }}>{REASON_WORDS[r.reason]}</b>
                  {r.others > 0 ? (
                    <span style={{ fontSize: 9.5, fontWeight: 900, padding: "2px 6px", borderRadius: 5, background: "#FEE2E2", color: "#B42318" }}>
                      {r.others} OTHER{r.others === 1 ? "" : "S"} REPORTED THIS
                    </span>
                  ) : null}
                  {!isOpen ? (
                    <span style={{ fontSize: 9.5, fontWeight: 900, padding: "2px 6px", borderRadius: 5, background: "var(--el)", color: SUB, textTransform: "uppercase" }}>{r.status}</span>
                  ) : null}
                </div>

                <div style={{ fontSize: 11.5, color: SUB, marginTop: 4, lineHeight: 1.5 }}>
                  {r.reporterName} reported {KIND_WORDS[r.subjectKind]}{" "}
                  {r.subjectHref ? (
                    <Link href={r.subjectHref} style={{ color: INK, fontWeight: 800 }}>
                      {r.subjectLabel ?? "it"}
                    </Link>
                  ) : (
                    <b>{r.subjectLabel ?? "something that is gone"}</b>
                  )}{" "}
                  · {agoWords(r.createdAt, nowIso)}
                </div>

                {r.note ? (
                  <div style={{ fontSize: 11.5, color: INK, marginTop: 7, lineHeight: 1.5, borderLeft: `2px solid ${EL}`, paddingLeft: 9 }}>{r.note}</div>
                ) : null}

                {r.decisionNote ? (
                  <div style={{ fontSize: 10.5, color: MUTED, marginTop: 7, lineHeight: 1.45 }}>Answered: {r.decisionNote}</div>
                ) : null}

                {isOpen ? (
                  answering === r.id ? (
                    <div style={{ marginTop: 9 }}>
                      <div style={{ display: "flex", gap: 6, marginBottom: 7 }}>
                        {([true, false] as const).map((v) => (
                          <button
                            key={String(v)}
                            type="button"
                            onClick={() => setActioned(v)}
                            aria-pressed={actioned === v}
                            style={{ ...btn, background: actioned === v ? "var(--text)" : CARD, color: actioned === v ? "var(--solid)" : SUB, border: `1px solid ${actioned === v ? "var(--text)" : EL}` }}
                          >
                            {v ? "We acted on it" : "No problem found"}
                          </button>
                        ))}
                      </div>
                      <label htmlFor={`note-${r.id}`} style={{ display: "block", fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED, marginBottom: 5 }}>
                        WHAT TO TELL {r.reporterName.split(" ")[0].toUpperCase()}
                      </label>
                      <textarea
                        id={`note-${r.id}`}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder={actioned ? "What you did about it." : "Why there is no problem here."}
                        style={{ width: "100%", boxSizing: "border-box", background: "var(--bg)", border: `1px solid ${EL}`, borderRadius: 10, padding: "8px 10px", fontSize: 12, color: INK, fontFamily: "inherit", resize: "vertical" }}
                      />
                      <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                        <button type="button" disabled={pending} onClick={() => answer(r)} style={{ ...btn, background: "var(--text)", color: "var(--solid)", border: "none" }} aria-label={`Send the answer for ${r.subjectLabel ?? "this report"}`}>
                          {pending ? "Sending…" : "Answer and close"}
                        </button>
                        <button type="button" onClick={() => { setAnswering(null); setNote(""); }} style={btn}>Cancel</button>
                      </div>
                      <div style={{ fontSize: 10, color: MUTED, marginTop: 6, lineHeight: 1.45 }}>
                        Closing the report is not the same as acting on the thing. Unlist the business on Businesses, or
                        suspend the account on Accounts — each is its own decision, and each is logged.
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => { setActioned(true); setNote(""); setAnswering(r.id); }} style={btn} aria-label={`Answer the report about ${r.subjectLabel ?? "it"}`}>
                        Answer
                      </button>
                      {r.subjectKind === "tenant" ? (
                        <Link href={`/admin/businesses?q=${encodeURIComponent(r.subjectLabel ?? "")}`} style={{ ...btn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                          Open in Businesses
                        </Link>
                      ) : r.subjectKind === "profile" ? (
                        <Link href={`/admin/accounts?q=${encodeURIComponent(r.subjectLabel ?? "")}`} style={{ ...btn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                          Open in Accounts
                        </Link>
                      ) : null}
                    </div>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Pager base={base} page={page} total={total} keep={{ status }} />

      {toast ? (
        <div role="status" style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "calc(28px + var(--dos-safe-bottom, 0px))", zIndex: 500, background: "var(--text)", color: "var(--solid)", borderRadius: 999, padding: "10px 18px", fontSize: 12, fontWeight: 800, width: "min(360px, calc(100vw - 44px))", textAlign: "center", boxSizing: "border-box" }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
