"use client";

import Link from "next/link";
import { useState, useTransition, type CSSProperties } from "react";
import { DosStylePicker } from "@/components/ui/DosStyleKit";
import { DOS_LEVELS, DOS_LEVEL_LABEL, dosStyleColor } from "@/lib/constants/styles";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { AUDIO_MAX_WORDS, MEDIA_BUCKET, photoUrl, routineAudioPath, whyNotATrack } from "@/lib/media/photo";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LearnedRoutine, RoutineWithUsage } from "@/repositories/routines";
import type { ClassLevel } from "@/types/class";
import { DeskHero } from "@/features/tenants/components/biz-kit";
import { saveRoutineAction } from "@/features/routines/server-actions/routines";

/** ROUTINES (19 Sep 2026, the user: "Routines are just a combination of Music —
 *  link or MP3 — and Video — link"). The prototype's S_choreos (17115), lifted:
 *  New routine over a search box over a row per routine, each row wearing its
 *  two media as chips you can actually press and its usage on the right.
 *
 *  ⚠ THE COUNT ON THE ROW IS CLASSES, and the number under it says so — the
 *  prototype printed `used` with the word "classes" beneath, and this one counts
 *  the same thing from the link rows rather than storing it. Sessions and
 *  students are on the routine's own page, where there is room to say what they
 *  mean. */

const card: CSSProperties = { background: "var(--card)", border: "1px solid var(--el)", borderRadius: 16, padding: "13px 14px", marginBottom: 10 };
const input: CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--solid)", border: "1.5px solid var(--el)", borderRadius: 12, padding: "11px 12px", fontSize: 13, color: INK, outline: "none", marginBottom: 8, fontFamily: "inherit", textTransform: "none" };
const eyebrow: CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", margin: "4px 0 6px" };
const bigBtn = (on: boolean): CSSProperties => ({ flex: 1, textAlign: "center", padding: "12px", borderRadius: 999, cursor: "pointer", fontWeight: 900, fontSize: 12.5, fontFamily: "inherit", border: on ? "none" : "1px solid var(--el)", background: on ? INK : "var(--card)", color: on ? LILAC : INK });

export function RoutinesDesk({
  routines,
  learned = [],
  canMake = true,
  userId,
}: {
  routines: RoutineWithUsage[];
  /** ⚠ ROUTINES YOU LEARNED (20 Sep 2026, the user: "routines you learned should
   *  also be a seprate tab in routines section and should be visible to user
   *  profiles as well in tools") — what was taught in a class you actually
   *  turned up to. Attendance, not bookings: the same rule the owner's side of
   *  this desk keeps, and Step 25's. */
  learned?: LearnedRoutine[];
  /** a routine belongs to the PERSON and is an artist's tool to make — a plain
   *  user opens this desk to see what they have been taught, so the making side
   *  says so rather than offering a form the database would refuse */
  canMake?: boolean;
  userId: string;
}) {
  const [seg, setSeg] = useState<"mine" | "learned">(canMake ? "mine" : "learned");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: "", style: "Hip-Hop", level: "all" as ClassLevel, songTitle: "", songSrc: "link" as "link" | "file", songUrl: "", videoUrl: "" });
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  const term = q.trim().toLowerCase();
  const list = term ? routines.filter((r) => [r.title, r.style, r.songTitle ?? ""].some((s) => s.toLowerCase().includes(term))) : routines;

  /* THE MP3 GOES STRAIGHT FROM THIS BROWSER TO STORAGE (the photos slice's rule,
     Rule 5): the file never rides a server action, and only the PATH is sent. */
  const pickTrack = async (file: File) => {
    const why = whyNotATrack(file);
    if (why) return fire(why);
    setBusy(true);
    try {
      const path = routineAudioPath(userId, file);
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        fire(error.message);
        return;
      }
      setF((x) => ({ ...x, songUrl: path, songTitle: x.songTitle || file.name.replace(/\.[^.]+$/, "") }));
      fire("🎵 Track attached");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!f.title.trim()) return fire("Name the routine");
    if (!f.songUrl.trim()) return fire(f.songSrc === "file" ? "Attach the MP3, or paste a link instead" : "Paste the song link");
    if (!f.videoUrl.trim()) return fire("Paste the video link");
    start(async () => {
      const out = await saveRoutineAction({
        title: f.title,
        style: f.style,
        level: f.level,
        songTitle: f.songTitle.trim() || null,
        songUrl: f.songUrl.trim(),
        songIsFile: f.songSrc === "file",
        videoUrl: f.videoUrl.trim(),
        status: "live",
      });
      if (out.error) return fire(out.error);
      setOpen(false);
      setF({ title: "", style: "Hip-Hop", level: "all", songTitle: "", songSrc: "link", songUrl: "", videoUrl: "" });
      fire("🎭 Routine added");
    });
  };

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "14px 16px 40px", boxSizing: "border-box" }}>
      {/* ⚠ NO FLOATING COUNT UNDER THE HERO (20 Sep 2026, the user: "similar
          figures need to be removed from all pages in the app inside the home tab
          for all profiles"). The list below IS the count, and each row already
          wears its own Live / Draft badge — so "4 routines · 3 live" was the page
          reading itself back. ⚠ The counts that STAY are the ones inside a shelf
          head beside its heading (`ManagedScreen`, `/classes`), which is the
          prototype's own DosShelfHead (3446) and a different object. */}
      <DeskHero tool="routines" as="h1" margin="0 0 12px" />

      {/* ── YOURS · LEARNED (20 Sep 2026) — the two sides of a routine: the ones
          you made and teach from, and the ones you were taught. Client state,
          not a URL: both lists are already on the page, so switching is free and
          there is nothing for a server to fetch (the lag the user reported on
          the class columns is a round trip; this one has none). ── */}
      <div role="group" aria-label="Show" style={{ display: "flex", gap: 2, background: "var(--el)", borderRadius: 12, padding: 3, marginBottom: 11 }}>
        {([["mine", `Yours · ${routines.length}`], ["learned", `Learned · ${learned.length}`]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setSeg(k)} aria-pressed={seg === k} style={{ flex: 1, padding: "8px 2px", borderRadius: 9, fontSize: 11.5, fontWeight: 800, border: "none", cursor: "pointer", fontFamily: "inherit", background: seg === k ? "var(--solid)" : "transparent", color: seg === k ? INK : SUB }}>
            {label}
          </button>
        ))}
      </div>

      {seg === "learned" ? (
        <>
          <div style={{ fontSize: 11, color: SUB, lineHeight: 1.5, padding: "0 2px 10px" }}>
            What was taught in a class you turned up to. It counts <b>attendance</b>, not bookings — a seat nobody marked is not a session danced.
          </div>
          {learned.map((r) => (
            <LearnedRow key={`${r.id}-${r.classId}`} r={r} />
          ))}
          {learned.length === 0 ? (
            <div style={{ ...card, textAlign: "center", fontSize: 12, color: SUB, border: "1.5px dashed var(--el)" }}>
              Nothing yet. A routine appears here once you have been checked in to a class that was taught from one.
            </div>
          ) : null}
        </>
      ) : !canMake ? (
        <div style={{ ...card, textAlign: "center", fontSize: 12, color: SUB, border: "1.5px dashed var(--el)" }}>
          Making a routine is an artist&rsquo;s tool. Take the Artist plan from Settings &rsaquo; Subscription and this side becomes yours.
        </div>
      ) : (
        <>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ ...bigBtn(true), width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 11, padding: "13px" }}>
        ＋ New routine
      </button>

      {open ? (
        <div style={card}>
          <div style={{ ...eyebrow, marginTop: 0 }}>NEW ROUTINE</div>
          <input aria-label="Routine name" value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} placeholder="Routine name" style={input} />
          <DosStylePicker value={f.style} onChange={(s) => setF((x) => ({ ...x, style: s }))} />
          <div style={{ display: "flex", gap: 7, margin: "8px 0" }}>
            {DOS_LEVELS.map(([code, label]) => (
              <button key={code} type="button" onClick={() => setF((x) => ({ ...x, level: code as ClassLevel }))} aria-pressed={f.level === code} style={{ flex: 1, padding: "9px 2px", borderRadius: 10, cursor: "pointer", fontSize: 11, fontWeight: 800, fontFamily: "inherit", border: "none", background: f.level === code ? INK : "var(--el)", color: f.level === code ? LILAC : SUB }}>
                {label}
              </button>
            ))}
          </div>

          {/* ⚠ NO SONG NAME FIELD (19 Sep 2026, the user: "just remove song name
              from the add routine form"). A routine is a song and a video — the
              link or the MP3 IS the song, and an attached file names itself from
              its own filename, so the column is still filled where it can be. */}
          <div style={eyebrow}>SONG · required</div>
          <div style={{ display: "flex", gap: 7, marginBottom: 8 }}>
            {([["link", "Paste link"], ["file", "Add MP3"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setF((x) => ({ ...x, songSrc: k, songUrl: "" }))} aria-pressed={f.songSrc === k} style={{ flex: 1, padding: 9, borderRadius: 10, cursor: "pointer", fontSize: 11.5, fontWeight: 800, fontFamily: "inherit", border: "none", background: f.songSrc === k ? INK : "var(--el)", color: f.songSrc === k ? LILAC : SUB }}>
                {l}
              </button>
            ))}
          </div>
          {f.songSrc === "link" ? (
            <input aria-label="Song link" value={f.songUrl} onChange={(e) => setF((x) => ({ ...x, songUrl: e.target.value }))} placeholder="Spotify / YouTube / Drive link" style={input} />
          ) : (
            <label style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 12px", borderRadius: 12, border: "1.5px dashed var(--el)", cursor: busy ? "wait" : "pointer", marginBottom: 8 }}>
              <span aria-hidden="true">🎵</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: f.songUrl ? INK : SUB, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {busy ? "Uploading…" : f.songUrl ? f.songUrl.split("/").pop() : `Choose an MP3 (up to ${AUDIO_MAX_WORDS})`}
              </span>
              <input
                type="file"
                accept="audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a"
                aria-label="Add an MP3"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void pickTrack(file);
                }}
              />
            </label>
          )}

          <div style={eyebrow}>VIDEO · required</div>
          <input aria-label="Video link" value={f.videoUrl} onChange={(e) => setF((x) => ({ ...x, videoUrl: e.target.value }))} placeholder="YouTube / Drive / Instagram link" style={input} />

          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button type="button" onClick={() => setOpen(false)} style={bigBtn(false)}>
              Cancel
            </button>
            <button type="button" disabled={pending || busy} onClick={save} style={{ ...bigBtn(true), flex: 1.4 }}>
              {pending ? "Saving…" : "Save routine"}
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--card)", border: "1px solid var(--el)", borderRadius: 12, padding: "9px 11px", marginBottom: 10 }}>
        <span aria-hidden="true" style={{ color: "var(--muted)", fontSize: 13 }}>
          ⌕
        </span>
        <input aria-label="Search routines" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search routines, styles or songs…" style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: INK, fontSize: 12.5, fontFamily: "inherit" }} />
      </div>

      {list.map((r) => (
        <RoutineRow key={r.id} r={r} />
      ))}
      {list.length === 0 ? (
        <div style={{ ...card, textAlign: "center", fontSize: 12, color: SUB, border: "1.5px dashed var(--el)" }}>
          {routines.length === 0 ? "No routines yet. A routine is a song and a video — add one, then put it on a class from the class's own page." : "No routines match that."}
        </div>
      ) : null}
        </>
      )}

      {toast ? (
        <div role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "#241B33", color: "#fff", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 40 }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}

/** ONE ROUTINE YOU LEARNED — its two media, the class it was taught in, and how
 *  many of that class's sessions you actually turned up to.
 *
 *  ⚠ THE ROW OPENS THE CLASS, not the routine's own page: `/routines/{id}` is the
 *  OWNER's usage screen — who danced it, how often — and who attended a class is
 *  not a fact the platform hands to somebody who was in the room. The song and
 *  the video are the part that is yours to keep, and they are on the row. */
function LearnedRow({ r }: { r: LearnedRoutine }) {
  const col = dosStyleColor(r.style);
  const songHref = r.songUrl ? (r.songIsFile ? photoUrl(r.songUrl) : r.songUrl) : null;
  const chip = (label: string, href: string | null, tint: string) =>
    href ? (
      <a key={label} href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`Open the ${label.startsWith("♪") ? "song" : "video"} for ${r.title}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "48%", padding: "3px 8px", borderRadius: 999, background: `${tint}1c`, border: `1px solid ${tint}44`, color: tint, fontSize: 9.5, fontWeight: 800, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </a>
    ) : null;
  const when = r.lastOn ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(new Date(r.lastOn)) : null;
  return (
    <Link href={`/c/${r.shareSlug}`} aria-label={`Open the class ${r.title} was taught in`} style={{ ...card, display: "flex", gap: 11, alignItems: "center", textDecoration: "none", color: INK }}>
      <span aria-hidden="true" style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 12, background: `${col}22`, border: `1px solid ${col}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
        ♪
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: "block", fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</b>
        <span style={{ display: "block", fontSize: 10.5, color: SUB, fontWeight: 700, marginTop: 1 }}>
          {r.style} · {DOS_LEVEL_LABEL[r.level] ?? r.level}
          {r.tenantName ? ` · ${r.tenantName}` : ""}
        </span>
        <span style={{ display: "flex", gap: 5, marginTop: 5 }}>
          {chip("♪ Song", songHref, col)}
          {chip("▶ Video", r.videoUrl, col)}
        </span>
      </span>
      <span style={{ flexShrink: 0, textAlign: "right" }}>
        <b style={{ display: "block", fontSize: 17, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{r.sessions}</b>
        <span style={{ display: "block", fontSize: 9, fontWeight: 800, color: "var(--muted)", letterSpacing: 0.6, marginTop: 3 }}>{r.sessions === 1 ? "SESSION" : "SESSIONS"}</span>
        {when ? <span style={{ display: "block", fontSize: 9.5, color: SUB, marginTop: 3 }}>{when}</span> : null}
      </span>
    </Link>
  );
}

/** One routine: its two media as chips that really open, and how many classes carry it. */
function RoutineRow({ r }: { r: RoutineWithUsage }) {
  const col = dosStyleColor(r.style);
  const songHref = r.songUrl ? (r.songIsFile ? photoUrl(r.songUrl) : r.songUrl) : null;
  const chip = (label: string, href: string | null, tint: string) =>
    href ? (
      <a key={label} href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`Open the ${label.startsWith("♪") ? "song" : "video"} for ${r.title}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "48%", padding: "3px 8px", borderRadius: 999, background: `${tint}1c`, border: `1px solid ${tint}44`, color: tint, fontSize: 9.5, fontWeight: 800, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </a>
    ) : null;
  return (
    <Link href={`/routines/${r.id}`} aria-label={`Open ${r.title}`} style={{ ...card, borderLeft: `4px solid ${col}`, display: "flex", alignItems: "center", gap: 11, padding: "12px 13px", textDecoration: "none", color: INK }}>
      <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 12, flexShrink: 0, background: `${col}22`, display: "flex", alignItems: "center", justifyContent: "center", color: col, fontSize: 15 }}>
        ▶
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 900 }}>
          {r.title}
          {r.status === "draft" ? <span style={{ marginLeft: 7, fontSize: 8.5, fontWeight: 900, padding: "2px 7px", borderRadius: 999, background: "var(--el)", color: SUB }}>DRAFT</span> : null}
        </span>
        <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 2 }}>
          {r.style} · {DOS_LEVEL_LABEL[r.level]}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
          {chip(`♪ ${r.songTitle ?? (r.songIsFile ? "MP3" : "Song")}`, songHref, "#22C55E")}
          {chip("▶ Video", r.videoUrl, "#8B5CF6")}
        </span>
      </span>
      <span style={{ textAlign: "right", flexShrink: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 900 }} data-testid="routine-classes">
          {r.classes}
        </span>
        <span style={{ display: "block", fontSize: 9, color: SUB }}>{r.classes === 1 ? "class" : "classes"}</span>
      </span>
      <span aria-hidden="true" style={{ color: "var(--muted)", fontSize: 16 }}>
        ›
      </span>
    </Link>
  );
}
