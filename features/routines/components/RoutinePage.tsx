"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { DOS_LEVEL_LABEL, dosStyleColor } from "@/lib/constants/styles";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import { deleteRoutineAction } from "@/features/routines/server-actions/routines";
import type { Routine, RoutineClass, RoutineStudent } from "@/repositories/routines";

/** ONE ROUTINE, AND WHAT IT HAS BEEN USED FOR (19 Sep 2026, the user: "there
 *  should be a way to see the usage for that particular routine as well — how
 *  many sessions taken with this and details of people who have taken classes
 *  for this routine and how many, all from within the routines section").
 *
 *  The prototype's S_routinedetail (17215): three figures, the MEDIA block with
 *  both links, TAUGHT IN, and STUDENTS WHO LEARNED IT. Every number here is
 *  counted from real rows, and the two words under them say which rows, because
 *  a figure nobody can explain is a figure nobody believes (9950):
 *   · CLASSES — the classes this routine is attached to;
 *   · SESSIONS — the ones that have actually ENDED. A class on the calendar has
 *     taught nobody yet;
 *   · DANCERS — the people who CHECKED IN, not the people who booked (Step 25's
 *     rule: a booking nobody marked is not a session danced). */

const card: CSSProperties = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "13px 14px", marginBottom: 10 };

function Sec({ label, col, children }: { label: string; col: string; children: ReactNode }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: col, marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

export function RoutinePage({ routine, classes, students }: { routine: Routine; classes: RoutineClass[]; students: RoutineStudent[] }) {
  const router = useRouter();
  const col = dosStyleColor(routine.style);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const songHref = routine.songUrl ? (routine.songIsFile ? photoUrl(routine.songUrl) : routine.songUrl) : null;
  /* the sessions that have run, over every class it is on */
  const sessions = classes.reduce((n, c) => n + c.sessions, 0);

  const media = (icon: string, label: string, title: string, href: string | null, badge: string, tint: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1.5px solid var(--el)" }}>
      <span aria-hidden="true" style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 10, background: `${tint}1c`, color: tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 9, fontWeight: 900, letterSpacing: 0.6, color: "var(--muted)" }}>{label}</span>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
      </span>
      <span style={{ flexShrink: 0, fontSize: 8.5, fontWeight: 900, padding: "2px 7px", borderRadius: 999, background: "var(--el)", color: SUB }}>{badge}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" aria-label={`Open the ${label.toLowerCase()}`} style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: tint, textDecoration: "none" }}>
          Open ›
        </a>
      ) : (
        <span style={{ flexShrink: 0, fontSize: 10.5, color: "var(--muted)" }}>—</span>
      )}
    </div>
  );

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "14px 16px 40px", boxSizing: "border-box" }}>
      <div style={{ borderRadius: 22, padding: "18px", background: `linear-gradient(135deg,${col},#7C3AED)`, color: "#fff", marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>{routine.title}</h1>
        <div style={{ fontSize: 11.5, opacity: 0.9, marginTop: 3 }}>
          {routine.style} · {DOS_LEVEL_LABEL[routine.level]}
          {routine.status === "draft" ? " · draft" : ""}
        </div>
      </div>

      {/* the three figures, each with the rows behind it named underneath */}
      <div style={{ ...card, display: "flex", gap: 8 }}>
        {([[classes.length, "Classes", "routine-classes"], [sessions, "Sessions held", "routine-sessions"], [students.length, "Dancers", "routine-dancers"]] as const).map(([v, l, tid]) => (
          <div key={l} style={{ flex: 1, textAlign: "center", background: "var(--el)", borderRadius: 12, padding: "10px 3px" }}>
            <div data-testid={tid} style={{ fontSize: 16, fontWeight: 900 }}>
              {v}
            </div>
            <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: SUB, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      <Sec label="MEDIA" col={col}>
        {media("♪", "SONG", routine.songTitle ?? (routine.songIsFile ? "Track" : "Song link"), songHref, routine.songIsFile ? "MP3" : "LINK", "#22C55E")}
        {media("▶", "VIDEO", "Video link", routine.videoUrl, "LINK", "#8B5CF6")}
      </Sec>

      <Sec label={`TAUGHT IN · ${classes.length}`} col={col}>
        {classes.length === 0 ? (
          <div style={{ fontSize: 11.5, color: SUB, padding: "6px 0" }}>Not on a class yet. Open a class you take and add it there.</div>
        ) : (
          classes.map((c) => (
            <Link key={c.classId} href={`/c/${c.shareSlug}`} aria-label={`Open ${c.style} · ${DOS_LEVEL_LABEL[c.level]}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1.5px solid var(--el)", fontSize: 11.5, textDecoration: "none", color: INK }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.style} · {DOS_LEVEL_LABEL[c.level]}
                </span>
                <span style={{ display: "block", color: SUB, fontSize: 10.5, marginTop: 1 }}>{c.businessName}</span>
              </span>
              <span style={{ flexShrink: 0, textAlign: "right", color: SUB }}>
                {c.sessions} {c.sessions === 1 ? "session" : "sessions"}
                <span style={{ display: "block", fontSize: 10.5 }}>
                  {c.students} {c.students === 1 ? "dancer" : "dancers"}
                </span>
              </span>
            </Link>
          ))
        )}
      </Sec>

      <Sec label={`DANCERS WHO LEARNED IT · ${students.length}`} col={col}>
        {students.length === 0 ? (
          <div style={{ fontSize: 11.5, color: SUB, padding: "6px 0", lineHeight: 1.5 }}>Nobody has danced it yet. This counts people who were CHECKED IN on a session, not people who booked one.</div>
        ) : (
          students.map((s) => {
            const face = photoUrl(s.avatarPath);
            return (
              <Link key={s.userId} href={`/person/${s.userId}`} aria-label={`Open ${s.name}'s profile`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1.5px solid var(--el)", textDecoration: "none", color: INK }}>
                <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, overflow: "hidden", background: `linear-gradient(135deg,${col},#7C3AED)`, color: "#fff", fontSize: 10.5, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {face ? <Image src={face} alt="" width={30} height={30} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : s.name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  {s.city ? <span style={{ display: "block", fontSize: 10, color: SUB }}>{s.city}</span> : null}
                </span>
                <span style={{ flexShrink: 0, textAlign: "right", fontSize: 11.5, fontWeight: 900 }}>
                  {s.sessions}
                  <span style={{ display: "block", fontSize: 9, fontWeight: 700, color: SUB }}>{s.sessions === 1 ? "session" : "sessions"}</span>
                </span>
              </Link>
            );
          })
        )}
      </Sec>

      {err ? <div role="alert" style={{ fontSize: 12, color: "#F87171", marginBottom: 8 }}>{err}</div> : null}
      {confirm ? (
        <div style={{ ...card, textAlign: "center" }}>
          <b style={{ fontSize: 15 }}>Delete this routine?</b>
          <div style={{ fontSize: 11.5, color: SUB, margin: "5px 0 12px", lineHeight: 1.5 }}>
            {routine.title} · on {classes.length} {classes.length === 1 ? "class" : "classes"}. The classes keep running; the routine comes off them.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => setConfirm(false)} style={{ flex: 1, padding: 13, borderRadius: 999, background: "var(--card)", border: "1.5px solid var(--el)", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: INK }}>
              Keep it
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const out = await deleteRoutineAction({ routineId: routine.id });
                  if (out.error) {
                    setErr(out.error);
                    setConfirm(false);
                    return;
                  }
                  router.push("/routines");
                })
              }
              style={{ flex: 1.3, padding: 13, borderRadius: 999, background: "#EF4444", color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer", border: "none", fontFamily: "inherit" }}
            >
              Delete routine
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} style={{ width: "100%", padding: 13, borderRadius: 999, background: "rgba(239,68,68,.14)", color: "#F87171", border: "1.5px solid rgba(239,68,68,.3)", fontWeight: 900, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
          Delete
        </button>
      )}
    </div>
  );
}
