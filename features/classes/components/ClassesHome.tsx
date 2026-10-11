"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import { DeskBody, DeskTop } from "@/components/ui/DeskSections";
import { ColumnCount, columnTab, columnTrack } from "@/components/ui/ColumnTabs";
import { Portal } from "@/components/ui/Portal";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { DOS_UI, MUTED, SUB } from "@/lib/design/tokens";
import type { ClassesTab, TimeGroup } from "@/features/classes/classesScreen";

/** ⚠⚠ THE CLASSES SCREEN (11 Oct 2026, the user: "still not happy with needs you
 *  and request section … your classes vs studio classes bifurcation … filters
 *  can maybe solve the classes section"). Their choices: To do · Upcoming · Past,
 *  a running class pinned at the top of Upcoming, the request switches behind a
 *  gear, and no weekly classes.
 *
 *   TO DO     — what waits on you (answer an ask, publish or fix a draft, decide
 *               refunds), then what waits on others (Withdraw). The count on the
 *               tab is only what waits on YOU. The answered asks are a button in
 *               the head, beside the gear, opening their class cards.
 *   UPCOMING  — Now (green, Scan on the card) · Today · This week · Later.
 *   PAST      — newest first.
 *
 *  One chip row narrows any tab by what the class is to you — a person's All ·
 *  Booked · Teaching · Assisting, a studio's All · Yours · Guests. Your own
 *  classes and the ones you teach at a studio are one list now; the card's two
 *  halves already say whose class it is.
 *
 *  ⚠ The cards are the SERVER's — every one arrives as a node with its buttons
 *  on it — so this file only groups, filters and draws the frame. */

export type TodoSection = "answer" | "mine" | "waiting";

export interface ClassItem {
  key: string;
  tab: ClassesTab;
  /** Upcoming and Past: where in time it sits */
  group?: TimeGroup;
  /** To do: whose move it is */
  section?: TodoSection;
  role: string;
  node: ReactNode;
}

/** does a chip take this item. ⚠ The "By studios" chip and its tags are GONE
 *  (11 Oct 2026, the user: "classes remove by studios filter") — the card's two
 *  halves already say who made a class */
const takes = (i: ClassItem, key: string) => i.role === key;

/** an answered ask, drawn as the class card it was about with the reply on it */
export interface AnsweredCard {
  key: string;
  node: ReactNode;
}

const TAB_WORD: Record<ClassesTab, string> = { todo: "To do", upcoming: "Upcoming", past: "Past" };
const GROUP_WORD: Record<TimeGroup, string> = { now: "Now", today: "Today", week: "This week", later: "Later", past: "Past" };
const SECTION_WORD: Record<TodoSection, string> = { answer: "Asked of you", mine: "Your move", waiting: "Waiting on others" };

const head: React.CSSProperties = { fontSize: 10, fontWeight: 900, letterSpacing: 1, color: SUB, textTransform: "uppercase", margin: "14px 2px 9px" };

const chip = (on: boolean, quiet: boolean): React.CSSProperties => ({
  flexShrink: 0,
  padding: "8px 13px",
  borderRadius: 999,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
  fontFamily: "inherit",
  border: `1.5px solid ${on ? "var(--text)" : "var(--el)"}`,
  background: on ? "var(--text)" : "var(--card)",
  color: on ? "var(--solid)" : quiet ? MUTED : "var(--text)",
  whiteSpace: "nowrap",
});

/** one bottom sheet, two uses: the request switches and the answered asks */
function Sheet({ title, onClose, children, scroll = false }: { title: string; onClose: () => void; children: ReactNode; scroll?: boolean }) {
  useCloseOnBack(onClose);
  return (
    <Portal>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 640 }}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          style={{ background: "var(--solid)", color: "var(--text)", borderRadius: "24px 24px 0 0", padding: "14px 16px 28px", width: "100%", maxWidth: 430, boxSizing: "border-box", animation: "dosSheetUp .22s ease-out", ...(scroll ? { maxHeight: "88vh", display: "flex", flexDirection: "column" as const } : {}) }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px", flexShrink: 0 }} />
          <div style={{ fontSize: 16, fontWeight: 900, fontFamily: DOS_UI, flexShrink: 0 }}>{title}</div>
          {scroll ? <div style={{ overflowY: "auto", margin: "10px -4px 0", padding: "0 4px", minHeight: 0 }}>{children}</div> : children}
          <button type="button" onClick={onClose} style={{ marginTop: 14, width: "100%", padding: 12, borderRadius: 999, border: "none", background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            Done
          </button>
        </div>
      </div>
    </Portal>
  );
}

const GearIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

/** a speech bubble with a tick — the asks that have had their answer */
const AnsweredIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <path d="M8.5 10.5l2.2 2.2 4.8-4.8" />
  </svg>
);

const headBtn: React.CSSProperties = { position: "relative", width: 38, height: 38, borderRadius: 19, border: "none", background: "rgba(255,255,255,.22)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 };

export function ClassesHome({
  mode,
  top,
  add = null,
  settings = null,
  roles,
  items,
  answered,
  initialTab,
  initialRole = "all",
  basePath,
}: {
  mode: "person" | "studio";
  /** the page's own heading (the tool hero) — a server node */
  top: ReactNode;
  /** Add Class, or the sentence in its place — null for nobody who can add */
  add?: ReactNode;
  /** the request switches, drawn in the gear's sheet */
  settings?: ReactNode;
  /** the chip row: key and word; "all" first */
  roles: Array<{ key: string; word: string }>;
  items: ClassItem[];
  answered: AnsweredCard[];
  initialTab: ClassesTab;
  initialRole?: string;
  /** the address this screen lives at, so the tabs and chips can write the query */
  basePath: string;
}) {
  /* ⚠ a chip is drawn only for what this account HAS — a learner with nothing to
     teach gets no Teaching · 0 — and with one kind of class there is no row at
     all, because its one chip would say what All says */
  /* ⚠ EVERY CHIP IS ALWAYS DRAWN, a 0 included (11 Oct 2026, the user: "make
     sure all filter chips even if 0 are always visible") — an empty one is
     drawn quiet, so the row reads the same for everybody and a 0 is an answer */
  const shownRoles = roles;
  const [tab, setTab] = useState<ClassesTab>(initialTab);
  const [role, setRole] = useState<string>(shownRoles.some((r) => r.key === initialRole) ? initialRole : "all");
  const [gear, setGear] = useState(false);
  const [showAnswered, setShowAnswered] = useState(false);

  /* the tab and the chip are the ADDRESS too, REPLACED rather than pushed — a
     setting of a page replaces (the 19 Sep rule), so back still leaves */
  const write = (t: ClassesTab, r: string) => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams();
    q.set("tab", t);
    if (r !== "all") q.set("role", r);
    window.history.replaceState(window.history.state, "", `${basePath}?${q.toString()}`);
  };
  const pickTab = (t: ClassesTab) => {
    setTab(t);
    write(t, role);
  };
  const pickRole = (r: string) => {
    setRole(r);
    write(tab, r);
  };

  const byRole = (list: ClassItem[]) => (role === "all" ? list : list.filter((i) => takes(i, role)));
  const inTab = (t: ClassesTab) => items.filter((i) => i.tab === t);
  const countTab = (t: ClassesTab) => (t === "todo" ? inTab("todo").filter((i) => i.section !== "waiting").length : inTab(t).length);
  const shown = byRole(inTab(tab));

  const tabs = (
    /* the app's one column switch (`ColumnTabs`, 11 Oct 2026) — every column row
       under Home is drawn from the same two styles as this one */
    <div role="tablist" aria-label="Classes" style={{ ...columnTrack(), marginTop: 12 }}>
      {(["todo", "upcoming", "past"] as ClassesTab[]).map((t) => {
        const on = tab === t;
        const n = countTab(t);
        return (
          <button key={t} type="button" role="tab" aria-selected={on} data-testid={`classes-tab-${t}`} onClick={() => pickTab(t)} style={columnTab(on)}>
            {TAB_WORD[t]}
            {n > 0 ? <ColumnCount n={n} on={on} attention={t === "todo"} /> : null}
          </button>
        );
      })}
    </div>
  );

  const chips =
    shownRoles.length > 0 ? (
      <div role="group" aria-label="Show" data-testid="classes-chips" style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2, marginTop: 10 }}>
        {shownRoles.map((r) => {
          const n = r.key === "all" ? inTab(tab).length : inTab(tab).filter((i) => takes(i, r.key)).length;
          return (
            <button key={r.key} type="button" aria-pressed={role === r.key} data-testid={`classes-chip-${r.key}`} onClick={() => pickRole(r.key)} style={chip(role === r.key, n === 0)}>
              {r.word} · {n}
            </button>
          );
        })}
      </div>
    ) : null;

  const empty = (text: ReactNode) => (
    <div data-testid="classes-empty" style={{ textAlign: "center", padding: "30px 18px", color: SUB, border: "1.5px dashed var(--el)", borderRadius: 20, fontSize: 13, lineHeight: 1.5, marginTop: 10 }}>
      {text}
    </div>
  );

  const list = (list: ClassItem[]) => list.map((i) => <div key={i.key}>{i.node}</div>);

  let body: ReactNode;
  if (tab === "todo") {
    const sections = (["answer", "mine", "waiting"] as TodoSection[]).map((s) => ({ s, rows: shown.filter((i) => i.section === s) })).filter((x) => x.rows.length > 0);
    body = (
      <div data-testid="classes-todo">
        {sections.length === 0 ? empty(role === "all" ? "Nothing to do." : "Nothing here.") : null}
        {sections.map(({ s, rows }) => (
          <section key={s} data-testid={`todo-${s}`}>
            <h2 style={{ ...head, color: s === "waiting" ? SUB : "#F59E0B" }}>
              {SECTION_WORD[s]} · {rows.length}
            </h2>
            {list(rows)}
          </section>
        ))}
      </div>
    );
  } else {
    const order: TimeGroup[] = tab === "upcoming" ? ["now", "today", "week", "later"] : ["past"];
    const groups = order.map((g) => ({ g, rows: shown.filter((i) => i.group === g) })).filter((x) => x.rows.length > 0);
    body =
      groups.length === 0 ? (
        empty(
          tab === "past" ? (
            "Nothing yet."
          ) : mode === "person" && (role === "all" || role === "booked") ? (
            <>
              Nothing coming up —{" "}
              <Link href="/discover?tab=classes" style={{ color: "var(--text)", fontWeight: 800 }}>
                find a class
              </Link>
            </>
          ) : (
            "Nothing coming up."
          )
        )
      ) : (
        <div data-testid={`classes-${tab}`}>
          {groups.map(({ g, rows }) => (
            <section key={g} data-testid={`timeline-${g}`}>
              {tab === "upcoming" ? (
                <h2 style={{ ...head, color: g === "now" ? "#22C55E" : SUB }}>
                  {GROUP_WORD[g]} · {rows.length}
                </h2>
              ) : null}
              {list(rows)}
            </section>
          ))}
        </div>
      );
  }

  return (
    <>
      <DeskTop style={{ paddingBottom: 12 }}>
        <div style={{ position: "relative" }}>
          {top}
          {/* ⚠ ANSWERED IS A BUTTON BESIDE THE GEAR (11 Oct 2026, the user) — it
              was a folded list at the foot of To do, which made a finished ask
              look like work. Drawn whatever the count, so it is always where it
              was last time; the badge says how many. */}
          <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 8 }}>
            <button type="button" aria-label={`Answered requests (${answered.length})`} data-testid="classes-answered" onClick={() => setShowAnswered(true)} style={headBtn}>
              <AnsweredIcon />
              {answered.length > 0 ? (
                <span style={{ position: "absolute", top: -3, right: -3, minWidth: 17, height: 17, padding: "0 4px", boxSizing: "border-box", borderRadius: 999, background: "#fff", color: "#111", fontSize: 10, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>
                  {answered.length}
                </span>
              ) : null}
            </button>
            {settings ? (
              <button type="button" aria-label="Request settings" data-testid="classes-settings" onClick={() => setGear(true)} style={headBtn}>
                <GearIcon />
              </button>
            ) : null}
          </div>
        </div>
        {add ? <div style={{ marginTop: 10 }}>{add}</div> : null}
        {tabs}
        {chips}
      </DeskTop>
      <DeskBody style={{ paddingTop: 4 }}>{body}</DeskBody>
      {gear && settings ? (
        <Sheet title="Class requests" onClose={() => setGear(false)}>
          {settings}
        </Sheet>
      ) : null}
      {showAnswered ? (
        <Sheet title={`Answered · ${answered.length}`} onClose={() => setShowAnswered(false)} scroll>
          <div data-testid="answered-list">
            {answered.length === 0 ? <div style={{ fontSize: 13, color: SUB, padding: "18px 2px" }}>Nothing answered yet.</div> : answered.map((a) => <div key={a.key}>{a.node}</div>)}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
