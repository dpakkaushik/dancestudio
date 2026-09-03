"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteEventAction, publishEventAction, setEventStatusAction } from "@/features/events/server-actions/events";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import type { DanceEvent, EventStatus } from "@/types/event";
import { entriesOf, seatsSoldOf } from "@/types/event";
import { EventCard } from "./EventCard";

/** The studio's events desk, lifted from prototype S_eventsmod (13811-13945):
 *  the tool hero in the desk's own colour (DOS_TOOLS "Events" #F59E0B), Create
 *  event, the live banner, Published · Draft · Completed tabs with counts, and
 *  the same card the calendar draws with this event's lifecycle underneath. */

const TOOL_COLOUR = "#F59E0B";
const toolPaint = (c: string) => `linear-gradient(135deg,${c} 0%, ${c}cc 55%, ${c}80 100%)`;
const TABS: Array<[EventStatus, string]> = [
  ["published", "Published"],
  ["draft", "Draft"],
  ["completed", "Completed"],
];

const pill = (danger = false): React.CSSProperties => ({
  fontSize: 10.5,
  fontWeight: 800,
  padding: "6px 11px",
  borderRadius: 999,
  cursor: "pointer",
  border: "none",
  background: danger ? "rgba(239,68,68,.14)" : "var(--el)",
  color: danger ? "#F87171" : INK,
  fontFamily: "inherit",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
});

const bizBtn: React.CSSProperties = {
  textAlign: "center",
  padding: 13,
  borderRadius: 999,
  background: "var(--text)",
  color: "var(--solid)",
  fontWeight: 900,
  fontSize: 13.5,
  cursor: "pointer",
  marginBottom: 10,
  textDecoration: "none",
};

export function EventsDesk({ tenantId, events, todayKey }: { tenantId: string; events: DanceEvent[]; todayKey: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<EventStatus>("published");
  const [liveOnly, setLiveOnly] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "publish" | "delete" | "complete" | "unpublish"; event: DanceEvent } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* system back closes the confirm sheet, exactly as its scrim does */
  useCloseOnBack(() => setConfirm(null), Boolean(confirm));

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };
  /* live: published, and today is inside its days (dosEventLive 343) */
  const isLive = (e: DanceEvent) => e.status === "published" && e.startDate <= todayKey && todayKey <= e.endDate;
  const liveCount = events.filter(isLive).length;
  const rows = events.filter((e) => e.status === tab).filter((e) => !liveOnly || isLive(e));

  const run = async (op: () => Promise<{ error: string | null }>, doneMsg: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await op();
    setBusy(false);
    setConfirm(null);
    if (out.error) {
      setError(out.error);
      return;
    }
    fire(doneMsg);
    router.refresh();
  };

  return (
    <div style={{ background: LILAC, maxWidth: 430, margin: "0 auto", color: INK, fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40 }}>
      <div style={{ margin: "12px 16px 0", borderRadius: 22, padding: "15px 17px 14px", color: "#fff", position: "relative", overflow: "hidden", background: toolPaint(TOOL_COLOUR) }}>
        <div style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, position: "relative", fontFamily: DOS_DISPLAY, lineHeight: 1.18 }}>Events</div>
      </div>
      <div style={{ padding: "12px 16px 0" }}>
        <Link href={`/business/${tenantId}/events/new`} aria-label="Create event" style={{ ...bizBtn, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create event
        </Link>

        {/* the live banner (LiveBanner 3949): on today AND inside today's window */}
        {liveCount > 0 ? (
          <div
            role="button"
            tabIndex={0}
            aria-pressed={liveOnly}
            onClick={() => setLiveOnly((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setLiveOnly((v) => !v);
              }
            }}
            style={{ display: "flex", alignItems: "center", gap: 10, background: liveOnly ? "rgba(34,197,94,.16)" : "var(--card)", border: `1.5px solid ${liveOnly ? "#22C55E" : "var(--el)"}`, borderRadius: 16, padding: "12px 13px", marginBottom: 10, cursor: "pointer" }}
          >
            <span style={{ position: "relative", width: 12, height: 12, flexShrink: 0 }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: 6, background: "#22C55E" }} />
              <span style={{ position: "absolute", inset: -4, borderRadius: 10, border: "2px solid #22C55E", opacity: 0.45, animation: "dosPulseH 1.4s ease-out infinite" }} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#22C55E" }}>
                {liveCount} {liveCount === 1 ? "event" : "events"} live right now
              </div>
              <div style={{ fontSize: 10.5, color: SUB, marginTop: 1 }}>{liveOnly ? "Showing live only — tap to show all" : "Tap to filter to live events"}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 900, padding: "5px 10px", borderRadius: 999, flexShrink: 0, background: liveOnly ? "#22C55E" : "var(--el)", color: liveOnly ? "#fff" : SUB }}>{liveOnly ? "ON" : "OFF"}</span>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 2, background: "var(--el)", borderRadius: 12, padding: 3, marginBottom: 12 }}>
          {TABS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 9, cursor: "pointer", fontSize: 11.5, fontWeight: 800, border: "none", fontFamily: "inherit", background: tab === k ? "var(--solid)" : "transparent", color: tab === k ? INK : SUB, boxShadow: tab === k ? "0 1px 4px rgba(0,0,0,.3)" : "none" }}
            >
              {l} · {events.filter((e) => e.status === k).length}
            </button>
          ))}
        </div>

        {error ? <div style={{ fontSize: 11.5, color: "#F87171", marginBottom: 10 }}>{error}</div> : null}

        {rows.length === 0 ? (
          <div style={{ background: "var(--card)", border: "1.5px dashed var(--el)", borderRadius: 16, padding: "22px 16px", textAlign: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>Nothing here yet</div>
            <div style={{ fontSize: 11, color: SUB, marginTop: 4 }}>Create an event — save it as a draft or publish straight away.</div>
          </div>
        ) : null}

        {rows.map((e) => (
          <div key={e.id} style={{ marginBottom: 6 }}>
            <EventCard event={e} href={`/business/${tenantId}/events/${e.id}`} />
            {/* this event's lifecycle, under the card (13843) */}
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", padding: "0 4px 8px" }}>
              <Link href={`/business/${tenantId}/events/${e.id}`} style={pill()}>
                Manage
              </Link>
              {e.status !== "completed" ? (
                <Link href={`/business/${tenantId}/events/${e.id}/edit`} style={pill()}>
                  Edit
                </Link>
              ) : null}
              {e.status === "draft" ? (
                <button type="button" onClick={() => setConfirm({ kind: "publish", event: e })} style={pill()}>
                  Publish
                </button>
              ) : null}
              {e.status === "published" ? (
                <>
                  <Link href={`/e/${e.shareSlug}`} style={pill()}>
                    Open page
                  </Link>
                  <button type="button" onClick={() => setConfirm({ kind: "complete", event: e })} style={pill()}>
                    Mark completed
                  </button>
                  <button type="button" onClick={() => setConfirm({ kind: "unpublish", event: e })} style={pill()}>
                    Back to draft
                  </button>
                </>
              ) : null}
              {e.status !== "completed" ? (
                <button type="button" onClick={() => setConfirm({ kind: "delete", event: e })} style={pill(true)}>
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {confirm ? (
        <div onClick={() => setConfirm(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.62)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 600 }}>
          <div role="dialog" aria-modal="true" aria-label={confirm.kind === "delete" ? "Delete this event?" : confirm.kind === "publish" ? "Publish this event?" : confirm.kind === "complete" ? "Mark this event completed?" : "Take this event back to draft?"} onClick={(ev) => ev.stopPropagation()} style={{ background: "var(--solid)", color: INK, borderRadius: "24px 24px 0 0", padding: "18px 16px 28px", width: "100%", maxWidth: 430, boxSizing: "border-box", textAlign: "center" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
            <b style={{ fontSize: 17 }}>{confirm.kind === "delete" ? (confirm.event.status === "published" ? "Delete this published event?" : "Delete this draft?") : confirm.kind === "publish" ? "Publish this event?" : confirm.kind === "complete" ? "Mark this event completed?" : "Take this event back to draft?"}</b>
            <div style={{ fontSize: 11.5, color: SUB, margin: "4px 0 14px", lineHeight: 1.5 }}>
              {confirm.event.title}
              <br />
              {confirm.kind === "delete"
                ? confirm.event.status === "published"
                  ? `${seatsSoldOf(confirm.event) + entriesOf(confirm.event)} booked must be refunded — every one is settled from its booking, and the record stays.`
                  : "It leaves the desk. Nothing was ever booked on a draft."
                : confirm.kind === "publish" ? "Check the details — this goes live immediately." : confirm.kind === "complete" ? "The page shows the final register instead of a booking bar." : "It comes off Discover until you publish again."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setConfirm(null)} style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: 999, background: "var(--card)", border: "1px solid var(--el)", fontWeight: 700, fontSize: 13, cursor: "pointer", color: INK, fontFamily: "inherit" }}>
                {confirm.kind === "delete" ? "Keep it" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const e = confirm.event;
                  if (confirm.kind === "delete") void run(() => deleteEventAction({ tenantId, eventId: e.id }), e.status === "draft" ? "Draft deleted" : "Event deleted");
                  else if (confirm.kind === "publish") void run(() => publishEventAction({ tenantId, eventId: e.id }), "🎟 Published — it is on Discover");
                  else if (confirm.kind === "complete") void run(() => setEventStatusAction({ tenantId, eventId: e.id, status: "completed" }), "Marked completed");
                  else void run(() => setEventStatusAction({ tenantId, eventId: e.id, status: "draft" }), "Back to draft");
                }}
                style={{ flex: 1.3, textAlign: "center", padding: 13, borderRadius: 999, background: confirm.kind === "delete" ? "#EF4444" : "var(--text)", color: confirm.kind === "delete" ? "#fff" : "var(--solid)", fontWeight: 900, fontSize: 13.5, cursor: busy ? "wait" : "pointer", border: "none", fontFamily: "inherit" }}
              >
                {confirm.kind === "delete" ? (confirm.event.status === "published" && seatsSoldOf(confirm.event) + entriesOf(confirm.event) > 0 ? "Delete & manage refunds" : "Delete") : confirm.kind === "publish" ? "Confirm & publish" : confirm.kind === "complete" ? "Mark completed" : "Back to draft"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div role="status" aria-live="polite" style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", boxShadow: "0 6px 24px rgba(0,0,0,.45)", color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650 }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
