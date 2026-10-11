"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { ColumnCount, columnTab, columnTrack } from "@/components/ui/ColumnTabs";
import { DeskBody, DeskTop } from "@/components/ui/DeskSections";
import { Portal } from "@/components/ui/Portal";
import { HueHead } from "@/features/businesses/components/biz-kit";
import { clearNotificationsAction, markNotificationsReadAction, setNotificationPrefsAction } from "@/features/notifications/server-actions/notifications";
import { PushDevice, type PushDeviceState } from "@/features/notifications/components/PushDevice";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, MUTED, SUB } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import {
  NOTIF_GROUPS,
  agoWords,
  groupOf,
  type AppNotification,
  type NotificationGlyph,
  type NotificationGroup,
  type NotificationKind,
  type NotificationPrefs,
} from "@/types/notification";

/** ⚠⚠ THE NOTIFICATIONS SCREEN, REVAMPED (11 Oct 2026, the user: "fix
 *  notifications completely revamp it according to new needs with notification
 *  history and settings managed properly"). Their choices:
 *
 *   GROUPS BY APP AREA — Classes · Studios & team · Crews & practice ·
 *     Enquiries · Money · DanceOS (`NOTIF_GROUPS`). Every row wears its group's
 *     tint and opens the screen where you act, marking itself read on the way.
 *   HISTORY IS TWO COLUMNS — New · Earlier, the app's own column switch
 *     (`ColumnTabs`, Classes' To do · Past). New is what you have not opened;
 *     opening one, or Mark all read, moves it to Earlier. Chips under the
 *     columns narrow by group — every chip always drawn, a 0 drawn quiet.
 *     NOTHING IS DELETED: Earlier keeps everything, and its Clear only HIDES
 *     (`clear_notifications` is a soft delete).
 *   SETTINGS BEHIND THE GEAR — this phone's push on top, then one row per group
 *     with two switches: Here (shown in the app) and Push (sent to the phone,
 *     off with a reason while push is off or this phone has none). WhatsApp and
 *     email are gone from the screen; the columns stay in the database.
 *
 *  The retired Events feature's old rows (`event`, all read) are drawn in
 *  Earlier as "Events (retired)" and have no settings row. */

type Column = "new" | "earlier";
type Filter = "all" | NotificationKind;

const pressable = { cursor: "pointer", fontFamily: "inherit" } as const;

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

const headBtn: React.CSSProperties = { position: "relative", width: 38, height: 38, borderRadius: 19, border: "1.5px solid var(--chip-line)", background: "var(--chip-bg)", color: "var(--text)", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, ...pressable };

const smallBtn = (tone: "plain" | "quiet"): React.CSSProperties => ({
  padding: "8px 13px",
  borderRadius: 999,
  border: "1.5px solid var(--el)",
  background: tone === "plain" ? "var(--card)" : "transparent",
  color: tone === "plain" ? INK : SUB,
  fontSize: 11.5,
  fontWeight: 900,
  whiteSpace: "nowrap",
  ...pressable,
});

const GearIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

/** one drawn mark per group, one stroke family */
function GroupGlyph({ glyph, size = 16 }: { glyph: NotificationGlyph; size?: number }) {
  const paths: Record<NotificationGlyph, ReactNode> = {
    class: (
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="3" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </>
    ),
    team: (
      <>
        <circle cx="9" cy="8.5" r="3" />
        <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
        <circle cx="17" cy="9.5" r="2.3" />
        <path d="M15.6 14.3c2.4.1 4.1 1.7 4.6 4.7" />
      </>
    ),
    crew: (
      <>
        <circle cx="12" cy="6.5" r="2.4" />
        <circle cx="5.5" cy="10" r="2" />
        <circle cx="18.5" cy="10" r="2" />
        <path d="M8 20c.4-3.3 1.9-5.5 4-5.5s3.6 2.2 4 5.5M2.5 19c.3-2.3 1.4-3.8 3-3.8M21.5 19c-.3-2.3-1.4-3.8-3-3.8" />
      </>
    ),
    enquiry: <path d="M21 14.5a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2H19a2 2 0 0 1 2 2zM8 9h9M8 12.5h6" />,
    money: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M9 8h6M9 10.5h6M10.5 8c2.6 0 2.6 4.5 0 4.5H9.5l4.5 4" />
      </>
    ),
    danceos: (
      <>
        <path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z" />
        <path d="M8.8 12l2.2 2.2 4.4-4.4" />
      </>
    ),
    event: <path d="M4 7.5a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4z" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[glyph]}
    </svg>
  );
}

function Toggle({ on, label, tint, disabled = false, testId, onPress }: { on: boolean; label: string; tint: string; disabled?: boolean; testId?: string; onPress: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      onClick={onPress}
      style={{ width: 42, height: 24, borderRadius: 12, flexShrink: 0, border: "none", padding: 0, background: on && !disabled ? tint : "var(--el)", position: "relative", opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
    >
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .15s" }} />
    </button>
  );
}

function SettingsSheet({ prefs, busy, onSave, onClose }: { prefs: NotificationPrefs; busy: boolean; onSave: (p: NotificationPrefs) => void; onClose: () => void }) {
  useCloseOnBack(onClose);
  const [draft, setDraft] = useState<NotificationPrefs>(prefs);
  const [device, setDevice] = useState<PushDeviceState>("checking");
  const pushOff = !draft.push;
  const noDevice = device !== "on";
  const why = pushOff ? "Push is off for your account." : device === "checking" ? "Checking this phone…" : noDevice ? "This phone has no push — turn it on above." : null;
  const flip = (map: "kinds" | "pushKinds", g: NotificationGroup) => setDraft({ ...draft, [map]: { ...draft[map], [g]: !draft[map][g] } });
  return (
    <Portal>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 940 }}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Notification settings"
          onClick={(e) => e.stopPropagation()}
          style={{ background: "var(--solid)", color: INK, borderRadius: "24px 24px 0 0", padding: "14px 16px 26px", width: "100%", maxWidth: 430, boxSizing: "border-box", maxHeight: "88vh", overflowY: "auto", animation: "dosSheetUp .22s ease-out", fontFamily: DOS_UI }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 16, fontWeight: 900 }}>Notification settings</div>

          <PushDevice onState={setDevice} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: "1.5px solid var(--el)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800 }}>Push to my phones</div>
              <div style={{ fontSize: 10.5, color: SUB, marginTop: 2 }}>Off stops every push, on every phone.</div>
            </div>
            <Toggle on={draft.push} label="Push to my phones" tint="#22C55E" testId="notif-push-master" onPress={() => setDraft({ ...draft, push: !draft.push })} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 2px" }}>
            <span style={{ flex: 1, fontSize: 9.5, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase", color: MUTED }}>By area</span>
            <span style={{ width: 42, textAlign: "center", fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", color: MUTED }}>Here</span>
            <span style={{ width: 42, textAlign: "center", fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", color: MUTED }}>Push</span>
          </div>
          {NOTIF_GROUPS.map((g) => {
            const k = g.k as NotificationGroup;
            return (
              <div key={k} data-testid={`notif-pref-${k}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1.5px solid var(--el)" }}>
                <span style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, background: `${g.tint}22`, color: g.tint, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <GroupGlyph glyph={g.glyph} size={15} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>{g.label}</div>
                  <div style={{ fontSize: 10.5, color: SUB, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.about}</div>
                </div>
                <Toggle on={draft.kinds[k]} label={`${g.label} here`} tint={g.tint} testId={`notif-here-${k}`} onPress={() => flip("kinds", k)} />
                <Toggle on={draft.pushKinds[k]} label={`${g.label} push`} tint={g.tint} disabled={pushOff || noDevice} testId={`notif-pushkind-${k}`} onPress={() => flip("pushKinds", k)} />
              </div>
            );
          })}
          {why ? (
            <div data-testid="notif-push-why" style={{ fontSize: 10.5, color: MUTED, marginTop: 8 }}>
              Push switches: {why}
            </div>
          ) : null}
          <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6 }}>An area off “here” is hidden from this screen and the bell. Nothing is deleted.</div>
          <button
            type="button"
            disabled={busy}
            aria-label="Save settings"
            onClick={() => onSave(draft)}
            style={{ marginTop: 16, width: "100%", padding: 13, borderRadius: 999, border: "none", background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 13, ...pressable }}
          >
            Done
          </button>
        </div>
      </div>
    </Portal>
  );
}

export function NotificationsScreen({
  notifications,
  prefs,
  nowIso,
  initialColumn = null,
  initialGroup = null,
}: {
  notifications: AppNotification[];
  prefs: NotificationPrefs;
  nowIso: string;
  /** the address's `?show=`; null lets the screen choose */
  initialColumn?: Column | null;
  initialGroup?: string | null;
}) {
  const router = useRouter();
  /* an area switched off "here" is not drawn at all — the bell already leaves it
     out (`my_unread_notifications`), so the screen and the badge agree */
  const shownHere = (k: NotificationKind) => k === "event" || prefs.kinds[k] !== false;
  const visible = notifications.filter((n) => shownHere(n.kind));
  const hiddenBySettings = notifications.length - visible.length;
  const fresh = visible.filter((n) => !n.readAt);
  const earlier = visible.filter((n) => n.readAt);

  const [column, setColumn] = useState<Column>(initialColumn ?? (fresh.length > 0 ? "new" : "earlier"));
  const groupKeys: NotificationKind[] = [...NOTIF_GROUPS.map((g) => g.k), ...(notifications.some((n) => n.kind === "event") ? (["event"] as NotificationKind[]) : [])];
  const [filter, setFilter] = useState<Filter>(groupKeys.includes(initialGroup as NotificationKind) ? (initialGroup as NotificationKind) : "all");
  const [prefOpen, setPrefOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* the column and the chip are the ADDRESS too, REPLACED rather than pushed — a
     setting of a page replaces (the 19 Sep rule), so back still leaves */
  const write = (c: Column, f: Filter) => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams();
    q.set("show", c);
    if (f !== "all") q.set("group", f);
    window.history.replaceState(window.history.state, "", `/notifications?${q.toString()}`);
  };
  const pickColumn = (c: Column) => {
    setColumn(c);
    write(c, filter);
  };
  const pickFilter = (f: Filter) => {
    setFilter(f);
    write(column, f);
  };

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };
  const run = async (op: () => Promise<{ error: string | null }>, done: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const out = await op();
    setBusy(false);
    if (out.error) {
      setError(out.error);
      return false;
    }
    fire(done);
    router.refresh();
    return true;
  };

  const inColumn = column === "new" ? fresh : earlier;
  const shown = filter === "all" ? inColumn : inColumn.filter((n) => n.kind === filter);
  const filterLabel = filter === "all" ? null : groupOf(filter).label;

  const openRow = async (n: AppNotification) => {
    if (!n.readAt) {
      await markNotificationsReadAction({ ids: [n.id] });
    }
    if (n.href) {
      router.push(n.href);
    } else {
      router.refresh();
    }
  };

  const markShownRead = () =>
    void run(
      () => (filter === "all" ? markNotificationsReadAction({}) : markNotificationsReadAction({ kind: filter })),
      filter === "all" ? "All marked read" : `${filterLabel} marked read`,
    );
  /* Clear hides what Earlier is showing — never a New one, and never erased */
  const clearShown = () => {
    const ids = shown.map((n) => n.id).slice(0, 200);
    if (!ids.length) return;
    void run(() => clearNotificationsAction({ ids }), ids.length === 1 ? "Hidden — nothing is deleted" : `${ids.length} hidden — nothing is deleted`);
  };

  const tabs = (
    <div role="tablist" aria-label="Notifications" style={{ ...columnTrack(), marginTop: 12 }}>
      {(["new", "earlier"] as Column[]).map((c) => {
        const on = column === c;
        const n = c === "new" ? fresh.length : earlier.length;
        return (
          <button key={c} type="button" role="tab" aria-selected={on} data-testid={`notif-tab-${c}`} onClick={() => pickColumn(c)} style={columnTab(on)}>
            {c === "new" ? "New" : "Earlier"}
            {n > 0 ? <ColumnCount n={n} on={on} attention={c === "new"} /> : null}
          </button>
        );
      })}
    </div>
  );

  /* ⚠ EVERY CHIP IS ALWAYS DRAWN, a 0 included (the Classes rule) — an empty one
     is drawn quiet, and an area switched off "here" says so */
  const chips = (
    <div role="group" aria-label="Show" data-testid="notif-chips" style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2, marginTop: 10 }}>
      <button type="button" aria-pressed={filter === "all"} data-testid="notif-chip-all" onClick={() => pickFilter("all")} style={chip(filter === "all", inColumn.length === 0)}>
        All · {inColumn.length}
      </button>
      {groupKeys.map((k) => {
        const g = groupOf(k);
        const off = !shownHere(k);
        const n = inColumn.filter((x) => x.kind === k).length;
        return (
          <button key={k} type="button" aria-pressed={filter === k} data-testid={`notif-chip-${k}`} onClick={() => pickFilter(k)} style={chip(filter === k, n === 0)}>
            {g.label} · {off ? "off" : n}
          </button>
        );
      })}
    </div>
  );

  const row = (n: AppNotification) => {
    const g = groupOf(n.kind);
    const unread = !n.readAt;
    return (
      <div
        key={n.id}
        data-testid="notif-row"
        data-kind={n.kind}
        data-read={unread ? "no" : "yes"}
        style={{ display: "flex", alignItems: "flex-start", gap: 6, background: "var(--card)", border: `1.5px solid ${unread ? `${g.tint}66` : "var(--el)"}`, borderRadius: 16, marginBottom: 8, padding: "4px 6px 4px 4px" }}
      >
        <button
          type="button"
          aria-label={`Open: ${n.title}`}
          onClick={() => void openRow(n)}
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 6px", background: "transparent", border: "none", textAlign: "left", color: INK, ...pressable }}
        >
          <span style={{ position: "relative", width: 34, height: 34, borderRadius: 11, flexShrink: 0, background: `${g.tint}22`, color: g.tint, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <GroupGlyph glyph={g.glyph} />
            {unread ? <span aria-hidden="true" data-testid="notif-unread-dot" style={{ position: "absolute", top: -2, right: -2, width: 9, height: 9, borderRadius: 5, background: g.tint, border: "2px solid var(--solid)" }} /> : null}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 9, fontWeight: 900, letterSpacing: 0.9, textTransform: "uppercase", color: g.tint }}>
              {g.label} · <span style={{ color: MUTED }}>{agoWords(n.createdAt, nowIso)}</span>
            </span>
            <span style={{ display: "block", fontSize: 13, fontWeight: unread ? 800 : 600, lineHeight: 1.35, marginTop: 2, overflowWrap: "anywhere" }}>{n.title}</span>
            {n.body ? <span style={{ display: "block", fontSize: 11, color: SUB, marginTop: 2, lineHeight: 1.4, overflowWrap: "anywhere" }}>{n.body}</span> : null}
          </span>
          {n.href ? <span aria-hidden="true" style={{ color: MUTED, fontSize: 15, alignSelf: "center", flexShrink: 0 }}>›</span> : null}
        </button>
        {!unread ? (
          <button type="button" disabled={busy} aria-label={`Hide: ${n.title}`} onClick={() => void run(() => clearNotificationsAction({ ids: [n.id] }), "Hidden — nothing is deleted")} style={{ flexShrink: 0, width: 30, height: 30, marginTop: 6, borderRadius: 15, border: "none", background: "transparent", color: MUTED, fontSize: 16, lineHeight: 1, ...pressable }}>
            ×
          </button>
        ) : null}
      </div>
    );
  };

  const empty = (text: ReactNode) => (
    <div data-testid="notif-empty" style={{ textAlign: "center", padding: "30px 18px", color: SUB, border: "1.5px dashed var(--el)", borderRadius: 20, fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>
      {text}
    </div>
  );

  let body: ReactNode;
  if (shown.length === 0) {
    body =
      column === "new"
        ? empty(
            <>
              <div style={{ fontWeight: 800, color: INK, fontFamily: DOS_DISPLAY }}>All caught up</div>
              <div style={{ marginTop: 3 }}>{filterLabel ? `Nothing new in ${filterLabel}.` : "Nothing new."}</div>
            </>,
          )
        : empty(filterLabel ? `Nothing earlier in ${filterLabel}.` : "Nothing earlier yet.");
  } else {
    body = (
      <div data-testid={`notif-${column}`}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 10px", flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 10, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase", color: SUB }}>
            {column === "new" ? "New" : "Earlier"}
            {filterLabel ? ` · ${filterLabel}` : ""} · {shown.length}
          </span>
          {column === "new" ? (
            <button type="button" disabled={busy} data-testid="notif-read-all" aria-label={filterLabel ? `Mark ${filterLabel} read` : "Mark all read"} onClick={markShownRead} style={smallBtn("plain")}>
              {filterLabel ? `Mark ${filterLabel} read` : "Mark all read"}
            </button>
          ) : (
            <button type="button" disabled={busy} data-testid="notif-clear" aria-label={filterLabel ? `Clear earlier ${filterLabel}` : "Clear earlier"} onClick={clearShown} style={smallBtn("quiet")}>
              Clear
            </button>
          )}
        </div>
        {shown.map(row)}
        {column === "earlier" ? <div style={{ fontSize: 10.5, color: MUTED, textAlign: "center", marginTop: 6 }}>Clear hides a notification — nothing is deleted.</div> : null}
      </div>
    );
  }

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "2px 16px 40px", boxSizing: "border-box", overflowX: "hidden" }}>
      <DeskTop style={{ paddingBottom: 12 }}>
        {/* the hero, in the notifications tint (DosHero), with the gear on its corner */}
        {/* ⚠ THE HUE HEADING (12 Oct 2026): `TAB_TITLE` over the notifications'
            violet, the gear on its line — the page's own `<h1>` */}
        <HueHead
          title="Notifications"
          color="#6D28D9"
          bottom="4px"
          subTestId="notif-counts"
          sub={`${fresh.length} new · ${visible.length} in all`}
          right={
            <button type="button" aria-label="Notification settings" data-testid="notif-settings" onClick={() => setPrefOpen(true)} style={headBtn}>
              <GearIcon />
            </button>
          }
        />
        {tabs}
        {chips}
        {hiddenBySettings > 0 ? (
          <div style={{ fontSize: 10.5, color: MUTED, marginTop: 8 }}>
            {hiddenBySettings} from areas switched off ·{" "}
            <button type="button" onClick={() => setPrefOpen(true)} style={{ border: "none", background: "transparent", padding: 0, color: INK, fontWeight: 800, fontSize: 10.5, textDecoration: "underline", ...pressable }}>
              Settings
            </button>
          </div>
        ) : null}
      </DeskTop>
      <DeskBody style={{ paddingTop: 4 }}>
        {error ? (
          <div role="alert" style={{ fontSize: 11.5, color: "#F87171", marginBottom: 10 }}>
            {error}
          </div>
        ) : null}
        {body}
      </DeskBody>

      {prefOpen ? (
        <SettingsSheet
          prefs={prefs}
          busy={busy}
          onClose={() => setPrefOpen(false)}
          onSave={(p) =>
            void run(() => setNotificationPrefsAction({ kinds: p.kinds, pushKinds: p.pushKinds, push: p.push }), "Settings saved").then((ok) => {
              if (ok) setPrefOpen(false);
            })
          }
        />
      ) : null}

      {toast ? (
        <div role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--el)", border: "1.5px solid #5AC8FA", color: INK, padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 950, fontFamily: DOS_DISPLAY, whiteSpace: "nowrap", pointerEvents: "none" }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}

