"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import { DeskBody, DeskTop } from "@/components/ui/DeskSections";
import { ColumnCount, columnTab, columnTrack } from "@/components/ui/ColumnTabs";
import { AnsweredButton, AnsweredSheet, GearButton, HeadCorner, RequestSettingsSheet } from "@/components/ui/RequestSettingsSheet";
import { MUTED, SUB } from "@/lib/design/tokens";
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

/* ⚠ THE SHEET, THE GEAR AND THE ANSWERED BUTTON ARE SHARED (11 Oct 2026, the
   user: "settings sections for classes and crew, studio and team can be
   better") — `components/ui/RequestSettingsSheet`, so the Studios and Crews hubs
   and the Team desks wear exactly these */

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
          <HeadCorner>
            <AnsweredButton count={answered.length} label="Answered requests" testId="classes-answered" onClick={() => setShowAnswered(true)} />
            {settings ? <GearButton testId="classes-settings" onClick={() => setGear(true)} /> : null}
          </HeadCorner>
        </div>
        {add ? <div style={{ marginTop: 10 }}>{add}</div> : null}
        {tabs}
        {chips}
      </DeskTop>
      <DeskBody style={{ paddingTop: 4 }}>{body}</DeskBody>
      {gear && settings ? (
        <RequestSettingsSheet title="Class requests" onClose={() => setGear(false)}>
          {settings}
        </RequestSettingsSheet>
      ) : null}
      {showAnswered ? (
        <AnsweredSheet count={answered.length} listTestId="answered-list" onClose={() => setShowAnswered(false)}>
          {answered.map((a) => (
            <div key={a.key}>{a.node}</div>
          ))}
        </AnsweredSheet>
      ) : null}
    </>
  );
}
