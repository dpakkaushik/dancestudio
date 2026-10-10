"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { DeskBody, DeskMiddle, DeskTop } from "@/components/ui/DeskSections";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { respondToVenueRequestAction } from "@/features/classes/server-actions/classes";
import { respondToClassAskAction } from "@/features/classPeople/server-actions/classPeople";
import type { RequestItem } from "@/features/inbox/components/InboxScreen";
import { DOS_UI, INK, SUB } from "@/lib/design/tokens";
import type { ClassArtist } from "@/types/classPerson";

/** ⚠⚠ THE CLASSES SCREEN, REIMAGINED (11 Oct 2026, the user's four choices:
 *  "One timeline + filter chips", "Needs-you strip", and in the first build the
 *  Running-now card, the stage board and one screen for a person and a studio).
 *
 *  It was up to five COLUMNS — My classes · Teaching · Assisting · Booked ·
 *  Requests — each split again into Upcoming · Past, so one question ("what am I
 *  doing with classes?") was ten lists behind taps. It is three bands now:
 *
 *   1. NEEDS YOU — only what waits on the person reading: an ask to answer (the
 *      class card with Accept · Reject, the Inbox's own RPCs), a no that came
 *      back, a draft ready to publish, refunds to decide. Not drawn when empty.
 *      The whole history of asks is one press away ("See all requests ›").
 *   2. RUNNING NOW — a class you run whose door is open (thirty minutes before it
 *      starts until it ends), with how many are in and the Scan and Register
 *      buttons that open the class page straight onto them.
 *   3. THE LIST — a person's is ONE TIMELINE (Now · Today · This week · Later ·
 *      Past, every card wearing its role, chips narrowing it in place) with the
 *      stage board of what they run behind the Mine chip; a studio's is the stage
 *      board itself.
 *
 *  ⚠ The cards are the server's — every `ClassTile` arrives as a node, so this
 *  file groups and filters and never re-derives a class. */

export type TimeGroup = "now" | "today" | "week" | "later" | "past";
export type TimelineRel = "booked" | "teaching" | "assisting";
export type ClassesView = "all" | TimelineRel | "mine";

export interface TimelineItem {
  key: string;
  group: TimeGroup;
  rel: TimelineRel;
  node: ReactNode;
}

export interface RunningItem {
  key: string;
  title: string;
  /** `/c/{slug}` — the card's buttons add `?open=register` / `?open=scan` */
  path: string;
  /** "Running · ends 7:00 pm" or "Starts 6:00 pm" */
  when: string;
  started: boolean;
  booked: number;
  capacity: number;
  /** null when this viewer may not read the register, so no count is claimed */
  checkedIn: number | null;
  /** whether this viewer runs the door — Scan is offered only then */
  canDoor: boolean;
  /** what the class is to them: Your class · Teaching · Assisting · At your studio */
  role: string;
}

export interface NeedLink {
  key: string;
  title: string;
  sub: string;
  href: string;
  tint: string;
  cta: string;
}

const GROUP_WORD: Record<TimeGroup, string> = {
  now: "Now",
  today: "Today",
  week: "This week",
  later: "Later",
  past: "Past",
};
const GROUPS: TimeGroup[] = ["now", "today", "week", "later", "past"];

const VIEW_WORD: Record<ClassesView, string> = {
  all: "All",
  booked: "Booked",
  teaching: "Teaching",
  assisting: "Assisting",
  mine: "Mine",
};

const head: React.CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: SUB, textTransform: "uppercase" };

const pill = (on: boolean): React.CSSProperties => ({
  flexShrink: 0,
  padding: "9px 14px",
  borderRadius: 999,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
  fontFamily: "inherit",
  border: `1.5px solid ${on ? "var(--text)" : "var(--el)"}`,
  background: on ? "var(--text)" : "var(--card)",
  color: on ? "var(--solid)" : "var(--text)",
  whiteSpace: "nowrap",
});

const doorBtn = (primary: boolean): React.CSSProperties => ({
  flex: "1 1 0",
  minWidth: 0,
  textAlign: "center",
  padding: "11px 12px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 900,
  textDecoration: "none",
  border: primary ? "none" : "1.5px solid var(--el)",
  background: primary ? "#22C55E" : "var(--card)",
  color: primary ? "#04220f" : "var(--text)",
});

export function ClassesHome({
  mode,
  top,
  asks,
  artists,
  needLinks,
  running,
  timeline = [],
  views = [],
  initialView = "all",
  board = null,
  requestsHref,
  requestsWaiting,
  basePath,
}: {
  mode: "person" | "studio";
  /** the page's own heading (the tool hero) — a server node */
  top: ReactNode;
  /** the asks put to this person or this studio that still wait on an answer */
  asks: RequestItem[];
  artists: Record<string, ClassArtist>;
  needLinks: NeedLink[];
  running: RunningItem[];
  timeline?: TimelineItem[];
  /** the chips a person gets — All first, Mine last for somebody with a register */
  views?: ClassesView[];
  initialView?: ClassesView;
  /** the stage board — a studio's whole list; a person's Mine chip */
  board?: ReactNode;
  /** every ask, answered ones too, with the switches for what you take */
  requestsHref: string;
  /** asks waiting on the people YOU asked — said beside the history link */
  requestsWaiting: number;
  /** the address this screen lives at, so the chips can write `?show=` */
  basePath: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<ClassesView>(initialView);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /* the chip is the ADDRESS too (`?show=`), replaced rather than pushed — a
     setting of a page replaces (the 19 Sep rule), so back still leaves */
  const pickView = (v: ClassesView) => {
    setView(v);
    if (typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", v === "all" ? basePath : `${basePath}?show=${v}`);
    }
  };

  const answer = async (r: RequestItem, accept: boolean) => {
    if (busy) return;
    setBusy(`${r.kind}-${r.id}`);
    setError(null);
    const out =
      r.kind === "venue"
        ? await respondToVenueRequestAction({ classId: r.classId!, accept })
        : await respondToClassAskAction({ classPersonId: r.classPersonId!, accept });
    setBusy(null);
    if (out.error) {
      setError(out.error);
      return;
    }
    setToast(accept ? `✅ Accepted · ${r.subjectTitle}` : `Rejected · ${r.who} has been told`);
    setTimeout(() => setToast(null), 2300);
    router.refresh();
  };

  const needsCount = asks.length + needLinks.length;

  /* ── 1 · NEEDS YOU ─────────────────────────────────────────────────────── */
  const needs =
    needsCount > 0 ? (
      <DeskMiddle style={{ padding: "14px 14px 6px" }}>
        <section data-testid="needs-you" aria-label="Needs you">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 5, background: "#F59E0B" }} />
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, fontFamily: DOS_UI }}>Needs you</h2>
            <span style={{ fontSize: 12, fontWeight: 800, color: SUB, fontVariantNumeric: "tabular-nums" }}>{needsCount}</span>
          </div>
          {asks.map((r) => {
            const k = `${r.kind}-${r.id}`;
            return (
              <div key={k} data-testid="needs-ask" style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11.5, color: SUB, margin: "0 2px 6px", lineHeight: 1.4 }}>
                  <b style={{ color: INK }}>{r.who}</b> wants {r.kind === "venue" ? "your room for this class" : <>you as <b style={{ color: "#8B5CF6" }}>{r.what}</b></>}
                </div>
                {r.danceClass ? (
                  <ClassTile
                    danceClass={r.danceClass}
                    artist={artists[r.danceClass.id] ?? null}
                    href={r.href ?? undefined}
                    relation={r.relation ?? null}
                    actions={
                      <>
                        <button type="button" disabled={busy === k} aria-label={`Reject ${r.subjectTitle}`} onClick={() => void answer(r, false)} style={{ flex: 1, padding: 11, borderRadius: 999, background: "var(--el)", color: "var(--text)", fontWeight: 800, fontSize: 12.5, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                          Reject
                        </button>
                        <button type="button" disabled={busy === k} aria-label={`Accept ${r.subjectTitle}`} onClick={() => void answer(r, true)} style={{ flex: 1.3, padding: 11, borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 12.5, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                          {busy === k ? "…" : "Accept"}
                        </button>
                      </>
                    }
                  />
                ) : (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "12px 14px", borderRadius: 16, background: "var(--card)", border: "1.5px solid var(--el)" }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800 }}>{r.subjectTitle}</div>
                    <button type="button" disabled={busy === k} aria-label={`Reject ${r.subjectTitle}`} onClick={() => void answer(r, false)} style={{ padding: "9px 12px", borderRadius: 999, background: "var(--el)", color: "var(--text)", fontWeight: 800, fontSize: 12, border: "none", cursor: "pointer" }}>
                      Reject
                    </button>
                    <button type="button" disabled={busy === k} aria-label={`Accept ${r.subjectTitle}`} onClick={() => void answer(r, true)} style={{ padding: "9px 12px", borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 12, border: "none", cursor: "pointer" }}>
                      Accept
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {needLinks.map((n) => (
            <Link
              key={n.key}
              href={n.href}
              data-testid="needs-link"
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", marginBottom: 10, borderRadius: 16, background: "var(--card)", border: "1.5px solid var(--el)", borderLeft: `4px solid ${n.tint}`, color: "var(--text)", textDecoration: "none" }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 900, lineHeight: 1.3 }}>{n.title}</span>
                <span style={{ display: "block", fontSize: 11, color: SUB, marginTop: 2, lineHeight: 1.35 }}>{n.sub}</span>
              </span>
              <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 900, color: n.tint }}>{n.cta} ›</span>
            </Link>
          ))}
          {error ? (
            <div role="alert" style={{ fontSize: 12, color: "#EF4444", fontWeight: 700, margin: "0 2px 10px" }}>
              {error}
            </div>
          ) : null}
        </section>
      </DeskMiddle>
    ) : null;

  /* ── 2 · RUNNING NOW ───────────────────────────────────────────────────── */
  const runningNow =
    running.length > 0 ? (
      <section data-testid="running-now" aria-label="Running now" style={{ marginBottom: 12 }}>
        {running.map((r) => (
          <div
            key={r.key}
            data-testid="running-card"
            style={{ borderRadius: 22, padding: "14px 15px 13px", marginBottom: 10, background: "linear-gradient(135deg, rgba(34,197,94,.20), rgba(34,197,94,.06))", border: "1.5px solid rgba(34,197,94,.55)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ position: "relative", width: 10, height: 10, flexShrink: 0 }}>
                <span style={{ position: "absolute", inset: 0, borderRadius: 5, background: "#22C55E" }} />
                {r.started ? <span style={{ position: "absolute", inset: -4, borderRadius: 9, border: "2px solid #22C55E", opacity: 0.45, animation: "dosPulseH 1.4s ease-out infinite" }} /> : null}
              </span>
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: "#22C55E" }}>{r.started ? "RUNNING NOW" : "DOOR OPEN"}</span>
              <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: SUB }}>{r.role}</span>
            </div>
            <Link href={r.path} style={{ display: "block", color: "var(--text)", textDecoration: "none", margin: "8px 0 2px" }}>
              <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: -0.4, fontFamily: DOS_UI }}>{r.title}</span>
            </Link>
            <div style={{ fontSize: 12, color: SUB, marginBottom: 10 }}>
              {r.when}
              {" · "}
              {r.checkedIn !== null ? (
                <b data-testid="running-in" style={{ color: INK, fontVariantNumeric: "tabular-nums" }}>
                  {r.checkedIn} of {r.booked} in
                </b>
              ) : (
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {r.booked}/{r.capacity} booked
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {r.canDoor ? (
                <>
                  <Link href={`${r.path}?open=scan`} aria-label={`Scan a code at ${r.title}`} data-testid="running-scan" style={doorBtn(true)}>
                    Scan
                  </Link>
                  <Link href={`${r.path}?open=register`} aria-label={`Open the register for ${r.title}`} data-testid="running-register" style={doorBtn(false)}>
                    Register
                  </Link>
                </>
              ) : (
                <Link href={r.path} style={doorBtn(false)}>
                  Open the class
                </Link>
              )}
            </div>
          </div>
        ))}
      </section>
    ) : null;

  /* ── 3 · THE LIST ──────────────────────────────────────────────────────── */
  const shown = view === "all" || view === "mine" ? timeline : timeline.filter((t) => t.rel === view);
  const countOf = (v: ClassesView) => (v === "all" ? timeline.length : v === "mine" ? null : timeline.filter((t) => t.rel === v).length);
  const groups = GROUPS.map((g) => ({ g, items: shown.filter((t) => t.group === g) })).filter((x) => x.items.length > 0);

  const list =
    mode === "studio" || view === "mine" ? (
      board
    ) : groups.length === 0 ? (
      <div style={{ textAlign: "center", padding: "36px 18px", color: SUB, border: "1.5px dashed var(--el)", borderRadius: 20, fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>
        {view === "all" ? (
          <>
            Nothing on yet —{" "}
            <Link href="/discover?tab=classes" style={{ color: "var(--text)", fontWeight: 800 }}>
              find a class
            </Link>
            . A class you are asked to teach or assist lands here once you say yes.
          </>
        ) : view === "booked" ? (
          <>
            Nothing booked —{" "}
            <Link href="/discover?tab=classes" style={{ color: "var(--text)", fontWeight: 800 }}>
              find a class
            </Link>
            .
          </>
        ) : (
          `Nothing you ${view === "teaching" ? "teach" : "assist on"} yet. When somebody asks you, the ask arrives under Needs you.`
        )}
      </div>
    ) : (
      <div data-testid="classes-timeline">
        {/* only the past on the list: say so above the fold, or the screen is
            one folded line and reads as broken */}
        {groups.every((x) => x.g === "past") ? (
          <div data-testid="timeline-nothing-ahead" style={{ fontSize: 12.5, color: SUB, margin: "10px 2px 4px", lineHeight: 1.45 }}>
            Nothing ahead —{" "}
            <Link href="/discover?tab=classes" style={{ color: "var(--text)", fontWeight: 800 }}>
              find a class
            </Link>
            .
          </div>
        ) : null}
        {groups.map(({ g, items }) =>
          g === "past" ? (
            /* what is over is a record — folded, one press away */
            <details key={g} data-testid="timeline-past" style={{ marginTop: 6 }}>
              <summary style={{ listStyle: "none", cursor: "pointer", margin: "12px 2px 9px" }}>
                <span style={head}>
                  {GROUP_WORD[g]} · {items.length} ›
                </span>
              </summary>
              {items.map((t) => (
                <div key={t.key}>{t.node}</div>
              ))}
            </details>
          ) : (
            <section key={g} data-testid={`timeline-${g}`}>
              <h2 style={{ ...head, margin: "12px 2px 9px", color: g === "now" ? "#22C55E" : SUB }}>
                {GROUP_WORD[g]} · {items.length}
              </h2>
              {items.map((t) => (
                <div key={t.key}>{t.node}</div>
              ))}
            </section>
          )
        )}
      </div>
    );

  const chipRow =
    mode === "person" && views.length > 1 ? (
      <div role="group" aria-label="Show" data-testid="classes-chips" style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2, marginBottom: 4 }}>
        {views.map((v) => {
          const n = countOf(v);
          return (
            <button key={v} type="button" aria-pressed={view === v} data-testid={`classes-chip-${v}`} onClick={() => pickView(v)} style={pill(view === v)}>
              {VIEW_WORD[v]}
              {n !== null ? ` · ${n}` : ""}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <>
      <DeskTop style={{ paddingBottom: 12 }}>
        {top}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <Link
            href={requestsHref}
            data-testid="see-all-requests"
            style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", textDecoration: "none", padding: "8px 13px", borderRadius: 999, border: "1.5px solid var(--el)", background: "var(--card)" }}
          >
            See all requests ›
          </Link>
          {requestsWaiting > 0 ? (
            <span style={{ fontSize: 11, color: "#F59E0B", fontWeight: 800 }}>
              {requestsWaiting} waiting on {requestsWaiting === 1 ? "somebody" : "others"}
            </span>
          ) : null}
        </div>
      </DeskTop>
      {needs}
      {runningNow}
      <DeskBody style={{ paddingTop: 10 }}>
        {chipRow}
        {list}
      </DeskBody>
      {toast ? (
        <div role="status" style={{ position: "fixed", left: "50%", bottom: "calc(var(--dos-foot, 90px) + 12px)", transform: "translateX(-50%)", background: "var(--solid)", color: "var(--text)", border: "1.5px solid #0EA5E9", borderRadius: 999, padding: "10px 16px", fontSize: 12.5, fontWeight: 800, zIndex: 700, pointerEvents: "none", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      ) : null}
    </>
  );
}
