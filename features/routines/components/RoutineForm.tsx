"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DosStylePicker } from "@/components/ui/DosStyleKit";
import {
  EL,
  FORM_LABEL,
  FORM_INPUT,
  FormBar,
  FormConfirm,
  FormNote,
  FormPage,
  FormSummary,
  FormToast,
  formPrimary,
} from "@/components/ui/FormPage";
import { saveRoutineAction } from "@/features/routines/server-actions/routines";
import { DOS_LEVELS, DOS_LEVEL_LABEL, dosStyleColor } from "@/lib/constants/styles";
import { INK, LILAC, SUB } from "@/lib/design/tokens";
import { AUDIO_MAX_WORDS, MEDIA_BUCKET, routineAudioPath, whyNotATrack } from "@/lib/media/photo";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ClassLevel } from "@/types/class";

/** NEW ROUTINE — a page now, wearing the ADD CLASS anatomy (21 Sep 2026, the
 *  user: *"same should be for new routine and new membership"*).
 *
 *  It was a card that expanded inside the Routines desk, which is why it looked
 *  nothing like Add class: no heading of its own, no step, no fixed bar, and a
 *  Cancel that collapsed a box rather than leaving a screen. The FIELDS are
 *  unchanged — a routine is still a name, a style, a level, a SONG and a VIDEO,
 *  and there is still no song-name field (19 Sep: the link or the MP3 IS the
 *  song, and an attached file names itself from its own filename).
 *
 *  ⚠ THE MP3 STILL GOES STRAIGHT FROM THIS BROWSER TO STORAGE (Rule 5): the file
 *  never rides a server action and only the PATH is sent, so moving the form to
 *  a page moved the upload with it rather than through a new door. */

/* ⚠ ONE PAGE, NO STEPS (22 Sep 2026, the user: "apart from class and event form
   all forms should be for one page"). It had two — "The routine" then "Song &
   video" — and the reason it is right to collapse them is the count: five
   fields. A step bar over five fields tells you there is more to come and then
   there is not, which is a promise the form cannot keep; a class and an event
   keep theirs because each is genuinely two decisions (when and where, then who
   and what it costs). The FIELDS are untouched. */

export function RoutineForm({ userId, sheet = false }: { userId: string; sheet?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [f, setF] = useState({
    title: "",
    style: "Hip-Hop",
    level: "all" as ClassLevel,
    songTitle: "",
    songSrc: "link" as "link" | "file",
    songUrl: "",
    videoUrl: "",
  });

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

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

  /* all three are required by the database, so the bar names whichever is
     missing — the name included, which used to be the first step's own gate */
  const blockers: string[] = [];
  if (!f.title.trim()) blockers.push("Name the routine first");
  if (!f.songUrl.trim()) blockers.push(f.songSrc === "file" ? "Attach the MP3, or paste a link instead" : "Paste the song link");
  if (!f.videoUrl.trim()) blockers.push("Paste the video link");
  const ready = blockers.length === 0;

  const save = () => {
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
      setConfirm(false);
      if (out.error) return fire(out.error);
      fire("🎭 Routine added");
      /* ⚠ A SHEET GOES BACK, A PAGE GOES TO THE DESK (22 Sep 2026). As a sheet
         the desk is already underneath — `back()` spends the `?new=1` entry that
         opened it, and `refresh()` re-runs the desk's own read so the new
         routine is in the list behind it. A `push` would stack a second copy of
         the desk on the history and leave the sheet's entry live behind it. */
      setTimeout(() => {
        if (sheet) {
          router.back();
          router.refresh();
          return;
        }
        router.push("/routines");
      }, 600);
    });
  };

  return (
    <FormPage title="Add routine" sheet={sheet} onClose={() => router.back()} onBack={() => router.back()}>
      <>
          <div style={FORM_LABEL}>ROUTINE NAME</div>
          <input aria-label="Routine name" value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value.slice(0, 120) }))} placeholder="e.g. Saturday set" style={FORM_INPUT} />

          <div style={FORM_LABEL}>DANCE STYLE</div>
          <DosStylePicker value={f.style} onChange={(s) => setF((x) => ({ ...x, style: s }))} />

          <div style={FORM_LABEL}>LEVEL</div>
          <div style={{ display: "flex", gap: 7 }}>
            {DOS_LEVELS.map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => setF((x) => ({ ...x, level: code as ClassLevel }))}
                aria-pressed={f.level === code}
                style={{ flex: 1, padding: "10px 2px", borderRadius: 10, cursor: "pointer", fontSize: 11.5, fontWeight: 800, fontFamily: "inherit", border: "none", background: f.level === code ? INK : EL, color: f.level === code ? LILAC : SUB }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={FORM_LABEL}>SONG · required</div>
          <div style={{ display: "flex", gap: 7, marginBottom: 8 }}>
            {([["link", "Paste link"], ["file", "Add MP3"]] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setF((x) => ({ ...x, songSrc: k, songUrl: "" }))}
                aria-pressed={f.songSrc === k}
                style={{ flex: 1, padding: 10, borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 800, fontFamily: "inherit", border: "none", background: f.songSrc === k ? INK : EL, color: f.songSrc === k ? LILAC : SUB }}
              >
                {l}
              </button>
            ))}
          </div>
          {f.songSrc === "link" ? (
            <input aria-label="Song link" value={f.songUrl} onChange={(e) => setF((x) => ({ ...x, songUrl: e.target.value }))} placeholder="Spotify / YouTube / Drive link" style={FORM_INPUT} />
          ) : (
            <label style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 13px", borderRadius: 12, border: `1.5px dashed ${EL}`, cursor: busy ? "wait" : "pointer" }}>
              <span aria-hidden="true">🎵</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: f.songUrl ? INK : SUB, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

          <div style={FORM_LABEL}>VIDEO · required</div>
          <input aria-label="Video link" value={f.videoUrl} onChange={(e) => setF((x) => ({ ...x, videoUrl: e.target.value }))} placeholder="YouTube / Drive / Instagram link" style={FORM_INPUT} />

          <FormNote blockers={blockers.length ? blockers : undefined}>
            A routine is yours, not a studio&rsquo;s — you carry it from one to the next. Attach it to a class from that class&rsquo;s own page.
          </FormNote>
      </>

      <FormBar>
        <button type="button" aria-disabled={!ready} onClick={() => (ready ? setConfirm(true) : fire(blockers[0]))} style={{ ...formPrimary(ready), flex: 1 }}>
          {ready ? "Save routine" : blockers[0]}
        </button>
      </FormBar>

      {confirm ? (
        <FormConfirm
          label="Save this routine?"
          title="Save this routine?"
          sub="It goes on your own Routines desk. Everybody who can read a class you attach it to can play the song and the video."
          confirmWord={pending ? "Saving…" : "Save routine"}
          busy={pending}
          onCancel={() => setConfirm(false)}
          onConfirm={save}
        >
          <FormSummary
            tint={dosStyleColor(f.style)}
            head={<span style={{ fontSize: 11.5, fontWeight: 800 }}>🎭 {f.style} · {DOS_LEVEL_LABEL[f.level] ?? f.level}</span>}
          >
            <b style={{ fontSize: 15 }}>{f.title.trim()}</b>
            <div style={{ fontSize: 12, color: SUB, marginTop: 4 }}>🎵 {f.songSrc === "file" ? "MP3 attached" : "Song linked"} · 🎬 Video linked</div>
          </FormSummary>
        </FormConfirm>
      ) : null}

      <FormToast msg={toast} />
    </FormPage>
  );
}
