"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearNotificationsAction, markNotificationsReadAction, setNotificationPrefsAction } from "@/features/notifications/server-actions/notifications";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { NOTIF_KINDS, agoWords, type AppNotification, type NotificationKind, type NotificationPrefs } from "@/types/notification";

/** The notifications screen — prototype S_notif (13702-13812) lifted: the hero
 *  ("What needs you", "N unread · N total") with the settings chip and Read
 *  all; then STACKED CARDS, ONE PER KIND — the count in a coin, the label, the
 *  newest title as its sub-line, "N NEW", and the chevron that turns — each
 *  opening onto its rows, every row an unread dot, a title, a body, an age and
 *  a × that clears it, with Mark read / Clear all under the stack; "All clear ·
 *  Nothing needs you right now." when there is nothing; and the settings sheet,
 *  "What reaches you" — a switch per kind ("Switch a kind off and its stack
 *  disappears from this screen") and the three channels under HOW THEY REACH
 *  YOU.
 *
 *  Two honest departures, both stated on the screen itself: swipe-to-clear is a
 *  touch gesture we have no test for, so the × is the way (the prototype's own
 *  hint line is replaced by nothing rather than a lie), and the three channels
 *  say what they are — recorded, not yet sending. */

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const micro: React.CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase" };
const pressKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

export function NotificationsScreen({ notifications, prefs, nowIso }: { notifications: AppNotification[]; prefs: NotificationPrefs; nowIso: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<NotificationKind | null>(null);
  const [prefOpen, setPrefOpen] = useState(false);
  const [draft, setDraft] = useState<NotificationPrefs>(prefs);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2000);
  };
  const run = async (op: () => Promise<{ error: string | null }>, done: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await op();
    setBusy(false);
    if (out.error) {
      setError(out.error);
      return;
    }
    fire(done);
    router.refresh();
  };

  const unreadTotal = notifications.filter((n) => !n.readAt).length;
  /* one row per kind — every notification of a kind stacks under a single card,
     and a kind switched off has no stack at all (13715) */
  const stacks = NOTIF_KINDS.filter((k) => prefs.kinds[k.k] !== false)
    .map((k) => ({ ...k, items: notifications.filter((n) => n.kind === k.k) }))
    .filter((s) => s.items.length > 0);

  const openRow = (n: AppNotification) => {
    void markNotificationsReadAction({ ids: [n.id] });
    if (n.href) {
      router.push(n.href);
    } else {
      router.refresh();
    }
  };

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40 }}>
      {/* the hero, in the notifications tint (DosHero) */}
      <div style={{ margin: "12px 16px 0", borderRadius: 22, padding: "15px 17px 14px", background: "linear-gradient(135deg, #5AC8FA, #6D28D9)", color: "#fff", position: "relative", overflow: "hidden" }}>
        <div aria-hidden="true" style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, position: "relative" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.4, textTransform: "uppercase", opacity: 0.85 }}>Notifications</div>
            <div style={{ fontSize: 21, fontWeight: 800, fontFamily: DOS_DISPLAY, letterSpacing: -0.5, lineHeight: 1.18, marginTop: 3 }}>What needs you</div>
            <div style={{ fontSize: 11.5, opacity: 0.9, marginTop: 3 }} data-testid="notif-counts">
              {unreadTotal} unread · {notifications.length} total
            </div>
          </div>
          <span style={{ display: "inline-flex", gap: 6, flexShrink: 0 }}>
            <span
              role="button"
              tabIndex={0}
              aria-label="Notification settings"
              onKeyDown={pressKey(() => {
                setDraft(prefs);
                setPrefOpen(true);
              })}
              onClick={() => {
                setDraft(prefs);
                setPrefOpen(true);
              }}
              style={{ width: 30, height: 30, borderRadius: 15, background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M4.5 12a7.5 7.5 0 0 1 .3-2l-1.4-1.2 1.8-3.1 1.7.7A7.5 7.5 0 0 1 9 4.9l.3-1.9h3.4l.3 1.9a7.5 7.5 0 0 1 2.1 1.2l1.7-.7 1.8 3.1L17.2 10a7.5 7.5 0 0 1 0 4l1.4 1.2-1.8 3.1-1.7-.7a7.5 7.5 0 0 1-2.1 1.2l-.3 1.9H9.3L9 18.8a7.5 7.5 0 0 1-2.1-1.2l-1.7.7-1.8-3.1L4.8 14a7.5 7.5 0 0 1-.3-2z" />
              </svg>
            </span>
            {notifications.length > 0 ? (
              <span role="button" tabIndex={0} aria-label="Read all" onKeyDown={pressKey(() => void run(() => markNotificationsReadAction({}), "All marked read"))} onClick={() => void run(() => markNotificationsReadAction({}), "All marked read")} style={{ fontSize: 10, fontWeight: 800, padding: "7px 11px", borderRadius: 999, background: "rgba(255,255,255,.2)", cursor: "pointer" }}>
                Read all
              </span>
            ) : null}
          </span>
        </div>
      </div>

      <div style={{ padding: "12px 16px 0" }}>
        {error ? <div style={{ fontSize: 11.5, color: "#F87171", marginBottom: 10 }}>{error}</div> : null}

        {stacks.map((s) => {
          const isOpen = open === s.k;
          const un = s.items.filter((i) => !i.readAt).length;
          return (
            <div key={s.k} style={{ background: "var(--card)", border: "1px solid var(--el)", borderLeft: `4px solid ${s.tint}`, borderRadius: 18, marginBottom: 9, overflow: "hidden" }}>
              <div role="button" tabIndex={0} aria-expanded={isOpen} aria-label={`${s.label} — ${s.items.length} ${s.items.length === 1 ? "update" : "updates"}`} onKeyDown={pressKey(() => setOpen(isOpen ? null : s.k))} onClick={() => setOpen(isOpen ? null : s.k)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 13px", cursor: "pointer" }}>
                <span style={{ width: 34, height: 34, borderRadius: 12, flexShrink: 0, background: `${s.tint}1e`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DOS_MONO, fontSize: 12.5, fontWeight: 600, color: s.tint }}>{s.items.length}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, fontFamily: DOS_DISPLAY, letterSpacing: -0.3 }}>{s.label}</div>
                  <div style={{ fontSize: 10.5, color: SUB, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isOpen ? `${s.items.length} ${s.items.length === 1 ? "update" : "updates"}` : s.items[0].title}</div>
                </div>
                {un ? <span style={{ fontSize: 8.5, fontWeight: 900, padding: "3px 8px", borderRadius: 999, background: `${s.tint}26`, color: s.tint, flexShrink: 0 }}>{un} NEW</span> : null}
                <span style={{ color: "var(--muted)", fontSize: 13, flexShrink: 0, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .16s", display: "inline-block" }}>›</span>
              </div>
              {isOpen ? (
                <div style={{ padding: "0 10px 10px" }}>
                  {s.items.map((n) => (
                    <div key={n.id} style={{ position: "relative", borderRadius: 12, marginBottom: 6, background: "var(--el)", display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 11px" }}>
                      <div role="button" tabIndex={0} aria-label={`Open: ${n.title}`} onKeyDown={pressKey(() => openRow(n))} onClick={() => openRow(n)} style={{ display: "flex", alignItems: "flex-start", gap: 9, flex: 1, minWidth: 0, cursor: "pointer" }}>
                        <span style={{ width: 7, height: 7, borderRadius: 4, marginTop: 4, flexShrink: 0, background: n.readAt ? "transparent" : s.tint, border: n.readAt ? "1.5px solid var(--muted)" : "none" }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: n.readAt ? 600 : 800, lineHeight: 1.35 }}>{n.title}</div>
                          {n.body ? <div style={{ fontSize: 10, color: SUB, marginTop: 2 }}>{n.body}</div> : null}
                          <div style={{ fontFamily: DOS_MONO, fontSize: 9, color: "var(--muted)", marginTop: 3 }}>{agoWords(n.createdAt, nowIso)}</div>
                        </div>
                      </div>
                      <button type="button" disabled={busy} aria-label={`Clear: ${n.title}`} onClick={() => void run(() => clearNotificationsAction({ ids: [n.id] }), "Cleared")} style={{ color: "var(--muted)", fontSize: 15, lineHeight: 1, padding: "0 2px", flexShrink: 0, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                        ×
                      </button>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 7, marginTop: 2 }}>
                    <button type="button" disabled={busy} aria-label={`Mark ${s.label} read`} onClick={() => void run(() => markNotificationsReadAction({ kind: s.k }), `${s.label} marked read`)} style={{ flex: 1, textAlign: "center", fontSize: 10.5, fontWeight: 800, padding: "8px", borderRadius: 999, background: "var(--el)", color: INK, cursor: "pointer", border: "none", fontFamily: "inherit" }}>
                      Mark read
                    </button>
                    <button type="button" disabled={busy} aria-label={`Clear all ${s.label}`} onClick={() => void run(() => clearNotificationsAction({ kind: s.k }), `${s.label} cleared`)} style={{ flex: 1, textAlign: "center", fontSize: 10.5, fontWeight: 800, padding: "8px", borderRadius: 999, background: "rgba(239,68,68,.14)", color: "#F87171", cursor: "pointer", border: "none", fontFamily: "inherit" }}>
                      Clear all
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {stacks.length === 0 ? (
          <div style={{ background: "var(--card)", border: "1.5px dashed var(--el)", borderRadius: 18, padding: "40px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 800, fontFamily: DOS_DISPLAY }}>All clear</div>
            <div style={{ fontSize: 11.5, color: SUB, marginTop: 4 }}>{notifications.length > 0 ? "Every kind is switched off in settings." : "Nothing needs you right now."}</div>
          </div>
        ) : null}
      </div>

      {/* the settings sheet — "What reaches you" (13784-13810) */}
      {prefOpen ? (
        <div onClick={() => setPrefOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.66)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 940 }}>
          <div role="dialog" aria-modal="true" aria-label="Notification settings" onClick={(e) => e.stopPropagation()} style={{ background: "var(--solid)", color: INK, borderRadius: "24px 24px 0 0", padding: "16px 16px 26px", width: "100%", maxWidth: 430, boxSizing: "border-box", maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
            <div style={{ ...micro, color: "var(--muted)" }}>Notification settings</div>
            <div style={{ fontSize: 17, fontWeight: 800, fontFamily: DOS_DISPLAY, letterSpacing: -0.4, marginBottom: 2 }}>What reaches you</div>
            <div style={{ fontSize: 11, color: SUB, marginBottom: 12 }}>Switch a kind off and its stack disappears from this screen. Nothing is deleted — switch it back on and the history is there.</div>
            {NOTIF_KINDS.map((k) => {
              const on = draft.kinds[k.k] !== false;
              return (
                <div role="button" tabIndex={0} key={k.k} aria-pressed={on} aria-label={k.label} onKeyDown={pressKey(() => setDraft({ ...draft, kinds: { ...draft.kinds, [k.k]: !on } }))} onClick={() => setDraft({ ...draft, kinds: { ...draft.kinds, [k.k]: !on } })} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 0", borderBottom: "1px solid var(--el)", cursor: "pointer" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: k.tint, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800 }}>{k.label}</span>
                  <span style={{ width: 42, height: 24, borderRadius: 12, flexShrink: 0, background: on ? k.tint : "var(--el)", position: "relative" }}>
                    <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .15s" }} />
                  </span>
                </div>
              );
            })}
            <div style={{ ...micro, letterSpacing: 0.8, color: "var(--muted)", margin: "14px 0 6px" }}>How they reach you</div>
            {(
              [
                ["push", "On this phone"],
                ["whatsapp", "WhatsApp"],
                ["email", "Email"],
              ] as Array<["push" | "whatsapp" | "email", string]>
            ).map(([k, l]) => {
              const on = draft[k];
              return (
                <div role="button" tabIndex={0} key={k} aria-pressed={on} aria-label={l} onKeyDown={pressKey(() => setDraft({ ...draft, [k]: !on }))} onClick={() => setDraft({ ...draft, [k]: !on })} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 0", borderBottom: "1px solid var(--el)", cursor: "pointer" }}>
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800 }}>{l}</span>
                  <span style={{ width: 42, height: 24, borderRadius: 12, flexShrink: 0, background: on ? "#22C55E" : "var(--el)", position: "relative" }}>
                    <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .15s" }} />
                  </span>
                </div>
              );
            })}
            {/* said on the screen, because the switch is real and the sending is not */}
            <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5, marginTop: 9 }}>
              Your answer is saved. Today DanceOS shows these here, in the app — a push to your phone, a WhatsApp message and an email each arrive with the thing that sends them.
            </div>
            <button type="button" disabled={busy} aria-label="Save settings" onClick={() => void run(() => setNotificationPrefsAction(draft), "Settings saved").then(() => setPrefOpen(false))} style={{ marginTop: 16, width: "100%", textAlign: "center", padding: "14px", borderRadius: 999, background: INK, color: LILAC, fontWeight: 900, fontSize: 14, cursor: "pointer", border: "none", fontFamily: "inherit" }}>
              Done
            </button>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--el)", border: "1.5px solid #5AC8FA", color: INK, padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 650, fontFamily: DOS_DISPLAY }}>{toast}</div>
      ) : null}
    </div>
  );
}
