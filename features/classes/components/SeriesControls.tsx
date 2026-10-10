"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cancelClassSessionAction, runLongerAction } from "@/features/classes/server-actions/classes";
import type { ClassSession } from "@/types/class";

/** THE WEEKS OF A WEEKLY CLASS, AND THE OWNER'S TWO CONTROLS OVER THEM
 *  (13 Oct 2026, the user: "Date chips on the class page", "Run longer later",
 *  and one session called off on its own with call-off refunds).
 *
 *  ⚠ A CHIP IS AN ADDRESS (`?session=`), replaced rather than pushed, because
 *  picking a week is a setting of the page and back should leave the page — the
 *  19 Sep rule. The page reads it on the server, so the seats, the booking bar,
 *  the passes and the register all become THAT week's; a learner books one
 *  session at a time, the one picked.
 *
 *  ⚠ CALLING A WEEK OFF NAVIGATES instead of closing the dialog (`useCloseOnBack`
 *  rule 2): the session it was on no longer exists, so it lands on the class's
 *  own link, which opens on the next week. The database refuses the last week
 *  still to come ("delete the class"), and a week that is over. */

const IST = "Asia/Kolkata";
/** "Thu 15 Oct" in IST */
const chipWords = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: IST });
/** YYYY-MM-DD in IST */
const istDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: IST });
const shiftDate = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** a weekly class runs at most this many live sessions — `add_weekly_sessions`' cap */
const MAX_WEEKS = 26;

export function SeriesControls({
  slug,
  classId,
  tint,
  sessions,
  pickedId,
  isOwner,
  over,
  pickedOver,
  totalLive,
}: {
  /** the week being looked at has already run — decided on the server */
  pickedOver: boolean;
  slug: string;
  classId: string;
  tint: string;
  /** the weeks still to run (plus the picked one if it is past); one entry for a one-session class */
  sessions: ClassSession[];
  pickedId: string | null;
  isOwner: boolean;
  /** the whole class has run its course */
  over: boolean;
  /** live sessions the class has in all, past ones included — for the 26 cap */
  totalLive: number;
}) {
  const router = useRouter();
  const [askOff, setAskOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [longer, setLonger] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const series = sessions.length > 1;
  const picked = sessions.find((s) => s.id === pickedId) ?? sessions[0] ?? null;
  const last = sessions[sessions.length - 1] ?? null;
  const lastDate = last ? istDate(last.startsAt) : null;
  const minUntil = lastDate ? shiftDate(lastDate, 7) : "";
  const roomLeft = Math.max(0, MAX_WEEKS - totalLive);
  const maxUntil = lastDate ? shiftDate(lastDate, 7 * roomLeft) : "";
  const [untilRaw, setUntil] = useState("");
  const until = !minUntil ? "" : !untilRaw ? (roomLeft >= 4 ? shiftDate(lastDate!, 28) : maxUntil) : untilRaw < minUntil ? minUntil : untilRaw > maxUntil ? maxUntil : untilRaw;
  const adding = lastDate && until ? Math.floor((Date.parse(`${until}T00:00:00Z`) - Date.parse(`${lastDate}T00:00:00Z`)) / (7 * 86_400_000)) : 0;

  const callOff = async () => {
    if (busy || !picked) return;
    setBusy(true);
    setErr(null);
    const out = await cancelClassSessionAction({ classId, sessionId: picked.id, slug });
    if (out.error) {
      setBusy(false);
      setErr(out.error);
      return;
    }
    router.replace(`/c/${slug}`);
  };

  const runLonger = async () => {
    if (busy || !until) return;
    setBusy(true);
    setMsg(null);
    const out = await runLongerAction({ classId, until, slug });
    setBusy(false);
    if (out.error) {
      setMsg(out.error);
      return;
    }
    setLonger(false);
    setMsg(`Added ${out.added} ${out.added === 1 ? "week" : "weeks"}`);
    router.refresh();
  };

  const pill = (on: boolean) => ({
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    textDecoration: "none",
    whiteSpace: "nowrap" as const,
    border: `1.5px solid ${on ? tint : "var(--el)"}`,
    background: on ? `${tint}2e` : "var(--card)",
    color: "var(--text)",
  });
  const smallBtn = {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 12px",
    borderRadius: 999,
    fontSize: 11.5,
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: "inherit",
    border: "1.5px solid var(--el)",
    background: "var(--card)",
    color: "var(--text)",
  } as const;

  if (!series && !(isOwner && !over)) return null;

  return (
    <div data-testid="class-series-controls" style={{ marginTop: 10 }}>
      {series ? (
        <>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.7, textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
            Weekly · {sessions.length} {sessions.length === 1 ? "session" : "sessions"} to go — pick a date
          </div>
          <div role="group" aria-label="Pick a date" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            {sessions.map((s) => {
              const on = s.id === picked?.id;
              return (
                <Link
                  key={s.id}
                  href={`/c/${slug}?session=${s.id}`}
                  replace
                  scroll={false}
                  data-testid="series-chip"
                  aria-current={on ? "true" : undefined}
                  aria-label={`${chipWords(s.startsAt)}${on ? ", picked" : ""}`}
                  style={pill(on)}
                >
                  {chipWords(s.startsAt)}
                </Link>
              );
            })}
          </div>
        </>
      ) : null}

      {isOwner && !over ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {series && picked && !pickedOver ? (
            <button type="button" data-testid="series-call-off" onClick={() => { setErr(null); setAskOff(true); }} style={{ ...smallBtn, color: "#F87171", borderColor: "rgba(248,113,113,.5)" }}>
              Call off {chipWords(picked.startsAt)}
            </button>
          ) : null}
          {roomLeft > 0 ? (
            <button type="button" data-testid="series-run-longer" aria-expanded={longer} onClick={() => setLonger(!longer)} style={smallBtn}>
              ↻ Run longer
            </button>
          ) : null}
        </div>
      ) : null}

      {longer && isOwner && !over ? (
        <div data-testid="series-run-longer-panel" style={{ marginTop: 8, padding: 10, borderRadius: 12, border: "1.5px solid var(--el)", background: "var(--card)" }}>
          <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 6 }}>Every week after {last ? chipWords(last.startsAt) : "the last session"}, until</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="date"
              aria-label="Run until"
              min={minUntil}
              max={maxUntil}
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              style={{ flex: 1, minWidth: 0, padding: "9px 10px", borderRadius: 10, border: "1.5px solid var(--el)", background: "var(--card)", color: "var(--text)", fontFamily: "inherit", fontSize: 13 }}
            />
            <button type="button" data-testid="series-run-longer-go" disabled={busy || adding < 1} onClick={() => void runLonger()} style={{ ...smallBtn, background: "var(--text)", color: "var(--solid)", borderColor: "var(--text)", opacity: busy || adding < 1 ? 0.5 : 1 }}>
              {busy ? "Adding…" : `Add ${adding} ${adding === 1 ? "week" : "weeks"}`}
            </button>
          </div>
        </div>
      ) : null}
      {msg ? <div role="status" data-testid="series-msg" style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)", marginTop: 6 }}>{msg}</div> : null}

      {askOff && picked ? (
        <ConfirmDialog
          title={`Call off ${chipWords(picked.startsAt)}?`}
          body="Only this week is called off — every other week stays. Everybody booked on it is told, and anybody who paid is refunded."
          goWord="Call it off"
          busy={busy}
          err={err}
          onKeep={() => (busy ? undefined : setAskOff(false))}
          onGo={() => void callOff()}
        />
      ) : null}
    </div>
  );
}
