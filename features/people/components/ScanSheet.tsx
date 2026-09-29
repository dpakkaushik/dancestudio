"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Portal } from "@/components/ui/Portal";
import { lookupPersonAction } from "@/features/people/server-actions/people";
import { DOS_UI } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { photoUrl } from "@/lib/media/photo";
import type { Profile } from "@/types/profile";

/** SCAN A PROFILE (19 Sep 2026, the user: "when adding a person … should have
 *  option to search name, mobile no., scan"). The camera reads a QR that carries
 *  a DanceOS profile link — `/person/{id}` — and the picker looks that person
 *  up and offers them exactly as a typed hit is offered. Nobody is added by the
 *  scan itself.
 *
 *  Built on the browser's own `BarcodeDetector` (Chrome on Android, which is
 *  where the installed app runs) — no decoding library taken on. Where it is
 *  missing (desktop Chromium, Safari) or the camera is refused, the sheet says
 *  so in one line and offers the other way in: paste the profile link. The
 *  paste field is not a consolation — a link shared over WhatsApp is how most
 *  profiles actually travel.
 *
 *  ⚠ WHAT THIS CANNOT READ YET: the QR the app DRAWS on a profile (`QRBlock`)
 *  is a hash pattern in the code's shape, not an encoded code — so a phone
 *  scanning another DanceOS phone's profile square finds nothing until the
 *  square is a real QR (a small encoder dependency; the backlog row says so). A
 *  real QR of the profile link — made anywhere — scans fine. */

interface DetectedCode {
  rawValue: string;
}
interface Detector {
  detect(source: HTMLVideoElement): Promise<DetectedCode[]>;
}
type DetectorCtor = new (opts?: { formats?: string[] }) => Detector;

const detectorCtor = (): DetectorCtor | null =>
  typeof window !== "undefined" && "BarcodeDetector" in window ? (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector : null;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** the person id inside a scanned or pasted value — a profile link, or the bare id; null for anything else */
export const personIdFromText = (text: string): string | null => {
  const t = text.trim();
  const link = t.match(new RegExp(`/person/(${UUID})`, "i"));
  if (link) return link[1].toLowerCase();
  const bare = t.match(new RegExp(`^(${UUID})$`, "i"));
  return bare ? bare[1].toLowerCase() : null;
};

type Status = "starting" | "scanning" | "unsupported" | "denied";

/** WHAT THE CALLER DID WITH THE PERSON THE SCAN FOUND (28 Sep 2026).
 *
 *  A caller that returns nothing owns the sheet and closes it itself — which is
 *  what the people picker does, because scanning somebody onto a class or a crew
 *  ends the errand. A caller that returns an outcome hands the sheet back: on
 *  `ok` the camera resumes with the message under it, ready for the NEXT person,
 *  and on a refusal the confirm card stays up wearing the reason. That second
 *  shape is what a DOOR needs — a register is a queue, not one decision. */
export interface ScanOutcome {
  ok: boolean;
  message?: string | null;
}

export function ScanSheet({
  onClose,
  onCode,
  busy = false,
  error = null,
  heading,
  confirmLabel = "Confirm",
}: {
  onClose: () => void;
  /** ⚠ the name is passed too, for a caller with no row to read one off — a
   *  handler that only wants the id still satisfies this (fewer parameters). */
  onCode: (personId: string, personName: string) => void | ScanOutcome | Promise<void | ScanOutcome>;
  busy?: boolean;
  error?: string | null;
  /** what this scan is FOR — "Check somebody in" on a register, the default on a picker */
  heading?: string;
  /** the word on the button that acts, so a door says what pressing it does */
  confirmLabel?: string;
}) {
  useCloseOnBack(onClose, true);
  const video = useRef<HTMLVideoElement | null>(null);
  /* decided once, on the client, at mount — the sheet only ever mounts from a press */
  const [supported] = useState(() => Boolean(detectorCtor()) && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
  const [status, setStatus] = useState<Status>(supported ? "starting" : "unsupported");
  const [pasted, setPasted] = useState("");
  const [pasteErr, setPasteErr] = useState<string | null>(null);

  /** ⚠⚠ A SCAN IS NOT A DECISION (28 Sep 2026, the user: "when scanning any
   *  persons qr code for entry for a class or event or in a team should first
   *  show profile pic with 2 buttons below for view profile and stats and option
   *  to confirm or deny the same, after confirmation only should check them in or
   *  add them").
   *
   *  Until now a decoded code went straight to the caller, which added the person
   *  — so the ONLY thing between a mis-scan and somebody on a roster was the
   *  camera pointing at the right square. A code carries an id and nothing a
   *  human can check, and the person holding the phone is looking at the phone
   *  rather than at the face in front of them. So the sheet resolves the id
   *  itself and shows WHO it found: their picture, their name, and two doors —
   *  their profile and their record — before anything is written. `onCode` is
   *  called from the Confirm button and from nowhere else.
   *
   *  ⚠ The lookup is `lookupPersonAction`, the same door the picker already used
   *  a moment later, so this moves the read rather than adding one — and its own
   *  refusals ("Nobody on DanceOS at that link") are shown here, where the person
   *  can scan again, instead of after a decision they have already taken. */
  const [found, setFound] = useState<(Profile & { isArtist: boolean }) | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookErr, setLookErr] = useState<string | null>(null);
  /* the caller's own answer to the last confirm — see `ScanOutcome` */
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [outErr, setOutErr] = useState<string | null>(null);

  /** ⚠⚠ WHETHER THE CAMERA IS STILL LOOKING — A REF, NOT A CLOSURE VARIABLE
   *  (28 Sep 2026). It was `let found = false` inside the effect, and the effect
   *  is mounted once for the sheet's whole life: so the FIRST decode set it and
   *  nothing could ever clear it. Pressing **Not them** put the camera back on
   *  screen with the detector permanently disarmed — the picture moved, the
   *  scanning line said "point the camera", and only the paste field still
   *  worked. Nothing caught it because until today one scan ended the errand.
   *  A register is a QUEUE, so the loop has to re-arm, and a ref is the only
   *  thing both the interval and a button can reach. */
  const armed = useRef(true);
  /** back to the camera, looking again */
  const rearm = (message: string | null) => {
    setNote(message);
    setOutErr(null);
    setLookErr(null);
    setFound(null);
    armed.current = true;
  };

  const resolve = useCallback(async (id: string) => {
    setLooking(true);
    setLookErr(null);
    setNote(null);
    const out = await lookupPersonAction({ userId: id });
    setLooking(false);
    if (!out.person) {
      setLookErr(out.error ?? "Nobody on DanceOS at that link");
      return;
    }
    setFound(out.person);
  }, []);

  /** the one place `onCode` is called. A caller that answers with an outcome
      keeps the sheet open — the camera comes back for the next person — and one
      that answers with nothing has taken the sheet over. */
  const act = async () => {
    if (!found || working) return;
    setOutErr(null);
    setWorking(true);
    /* ⚠ the NAME goes with the id (29 Sep 2026). A door that books somebody has
       no register row to read a name off yet, so without this its one message
       back would have to say "Booked in" about nobody in particular — and the
       sheet is a QUEUE, so that message sits under the camera while the next
       person steps up. The sheet has the person on screen; it may as well say
       who. Optional, so a caller that does not care ignores it. */
    const out = await onCode(found.id, found.fullName);
    setWorking(false);
    if (!out || typeof out !== "object") return;
    if (out.ok) {
      rearm(out.message ?? null);
    } else {
      setOutErr(out.message ?? "That did not work");
    }
  };

  /* the camera and the detector live exactly as long as the sheet does; every
     state write below happens in an async callback, never in the effect body */
  useEffect(() => {
    if (!supported) return;
    const Ctor = detectorCtor();
    if (!Ctor) return;
    let live = true;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const detector = new Ctor({ formats: ["qr_code"] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        if (!live) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const v = video.current;
        if (v) {
          v.srcObject = s;
          v.play().catch(() => {});
        }
        setStatus("scanning");
        timer = setInterval(async () => {
          const el = video.current;
          if (!el || !armed.current || el.readyState < 2) return;
          try {
            const codes = await detector.detect(el);
            const id = codes.map((c) => personIdFromText(c.rawValue)).find(Boolean);
            if (id && live && armed.current) {
              /* ⚠ ONE decode wins and the camera stops mattering: the sheet
                 moves to the confirm card, and nothing is written until the
                 person holding the phone says so. */
              armed.current = false;
              void resolve(id);
            }
          } catch {
            /* a frame that would not decode is just the next frame's turn */
          }
        }, 300);
      })
      .catch(() => {
        if (live) setStatus("denied");
      });
    return () => {
      live = false;
      if (timer) clearInterval(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [supported, resolve]);

  const usePasted = () => {
    const id = personIdFromText(pasted);
    if (!id) {
      setPasteErr("That is not a DanceOS profile link.");
      return;
    }
    setPasteErr(null);
    void resolve(id);
  };

  const line =
    status === "unsupported"
      ? "This browser cannot read a code from the camera — paste their profile link instead."
      : status === "denied"
        ? "The camera was refused — paste their profile link instead."
        : status === "starting"
          ? "Starting the camera…"
          : "Point the camera at a DanceOS profile code.";

  return (
    <Portal>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.66)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 950, fontFamily: DOS_UI }}>
        <div role="dialog" aria-modal="true" aria-label="Scan a profile" onClick={(e) => e.stopPropagation()} style={{ background: "var(--solid)", color: "var(--text)", borderRadius: "24px 24px 0 0", padding: "16px 16px 26px", width: "100%", maxWidth: 430, boxSizing: "border-box", animation: "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)" }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.2, color: "var(--muted)" }}>SCAN A PROFILE</div>
          <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 10 }}>{found ? "Is this them?" : (heading ?? "Their DanceOS code")}</div>

          {/* ── WHO THE CODE FOUND, BEFORE ANYTHING IS WRITTEN ── */}
          {found ? (
            <div data-testid="scan-confirm">
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "6px 0 14px" }}>
                <div style={{ width: 96, height: 96, borderRadius: 29, overflow: "hidden", background: "var(--el)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 900, color: "var(--sub)" }}>
                  {photoUrl(found.avatarPath) ? (
                    <Image src={photoUrl(found.avatarPath) as string} alt="" width={96} height={96} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    found.fullName.split(" ").filter(Boolean).map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
                  )}
                </div>
                <div style={{ fontSize: 17, fontWeight: 900, textAlign: "center" }}>{found.fullName}</div>
                <div style={{ fontSize: 11, color: "var(--sub)", fontWeight: 700 }}>
                  {found.isArtist ? "Artist" : "User"}
                  {found.city ? ` · ${found.city}` : ""}
                </div>
              </div>
              {/* the two doors the user asked for — both open in a new tab, so
                  looking somebody up does not throw away the scan you just made.
                  ⚠ INVERTED AGAINST THE THEME (29 Sep 2026, the user: "when
                  scanning a profile for attendance in a class should show view
                  stats and profile in opposite color to the theme"). They wore
                  `--card` on `--text`, which is the QUIETEST pair this app has —
                  and on a door, mid-scan, with somebody waiting, the two things
                  you might want to check should not be the faintest thing on the
                  sheet. `--text` on `--solid` is the app's own "opposite", the
                  same pair Confirm below them uses. */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <Link href={`/person/${found.id}`} target="_blank" rel="noreferrer" aria-label={`View ${found.fullName}'s profile`} style={{ textAlign: "center", padding: "11px 8px", borderRadius: 12, background: "var(--text)", border: "none", color: "var(--solid)", fontSize: 12, fontWeight: 900, textDecoration: "none" }}>
                  View profile
                </Link>
                <Link href={`/person/${found.id}/stats`} target="_blank" rel="noreferrer" aria-label={`${found.fullName}'s record and rank`} style={{ textAlign: "center", padding: "11px 8px", borderRadius: 12, background: "var(--text)", border: "none", color: "var(--solid)", fontSize: 12, fontWeight: 900, textDecoration: "none" }}>
                  Stats
                </Link>
              </div>
              {error || outErr ? <div role="alert" style={{ fontSize: 11, color: "#F87171", marginBottom: 10, fontWeight: 700 }}>{error ?? outErr}</div> : null}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => rearm(null)}
                  disabled={busy || working}
                  aria-label="Not them — scan again"
                  style={{ flex: 1, padding: 13, borderRadius: 999, background: "var(--card)", color: "var(--text)", fontWeight: 900, fontSize: 13.5, cursor: busy || working ? "not-allowed" : "pointer", border: "1.5px solid var(--el)", fontFamily: "inherit" }}
                >
                  Not them
                </button>
                <button
                  type="button"
                  onClick={() => void act()}
                  disabled={busy || working}
                  aria-label={`${confirmLabel} ${found.fullName}`}
                  style={{ flex: 1, padding: 13, borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 13.5, cursor: busy || working ? "not-allowed" : "pointer", border: "none", fontFamily: "inherit", opacity: busy || working ? 0.6 : 1 }}
                >
                  {busy || working ? "Working…" : confirmLabel}
                </button>
              </div>
              <button type="button" onClick={onClose} style={{ marginTop: 10, textAlign: "center", padding: 11, borderRadius: 999, background: "transparent", color: "var(--sub)", fontWeight: 800, fontSize: 12, cursor: "pointer", border: "none", fontFamily: "inherit", width: "100%" }}>
                Cancel
              </button>
            </div>
          ) : (
            <>
          {supported && status !== "denied" ? (
            <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", background: "#000", aspectRatio: "1 / 1", maxHeight: 320, marginBottom: 10 }}>
              {/* the camera's own picture; muted and inline so a phone does not open a player */}
              <video ref={video} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <div aria-hidden="true" style={{ position: "absolute", inset: "14%", border: "2px solid rgba(255,255,255,.85)", borderRadius: 18, boxShadow: "0 0 0 999px rgba(0,0,0,.28)" }} />
            </div>
          ) : null}
          {/* ⚠ WHAT THE LAST SCAN DID, WHILE THE CAMERA LOOKS FOR THE NEXT ONE
              (28 Sep 2026). A door scans a queue, so the sheet stays open and
              says "✓ Asha checked in" here rather than closing and toasting —
              the person holding the phone never looks away from the camera. */}
          {note ? (
            <div role="status" style={{ fontSize: 12, fontWeight: 800, color: "#22C55E", background: "rgba(34,197,94,.12)", border: "1.5px solid rgba(34,197,94,.3)", borderRadius: 12, padding: "9px 11px", marginBottom: 10 }}>
              {note}
            </div>
          ) : null}
          <div role="status" style={{ fontSize: 11.5, color: looking ? "var(--text)" : "var(--sub)", marginBottom: 12 }}>
            {looking ? "Looking them up…" : line}
          </div>
          {lookErr ? <div role="alert" style={{ fontSize: 11, color: "#F87171", marginBottom: 10, fontWeight: 700 }}>{lookErr}</div> : null}
          {error ? <div style={{ fontSize: 11, color: "#F87171", marginBottom: 10 }}>{error}</div> : null}
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)", marginBottom: 7 }}>OR PASTE THEIR PROFILE LINK</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={pasted}
              onChange={(e) => setPasted(e.target.value.slice(0, 200))}
              aria-label="Profile link"
              placeholder="https://…/person/…"
              autoComplete="off"
              inputMode="url"
              style={{ flex: 1, minWidth: 0, background: "var(--el)", border: "none", outline: "none", borderRadius: 11, padding: "10px 11px", color: "var(--text)", fontSize: 12.5, fontFamily: DOS_UI }}
            />
            <button type="button" onClick={usePasted} disabled={busy || pasted.trim().length === 0} style={{ padding: "0 14px", borderRadius: 11, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 12.5, border: "none", cursor: "pointer", fontFamily: "inherit", opacity: busy || pasted.trim().length === 0 ? 0.45 : 1 }}>
              Use link
            </button>
          </div>
          {pasteErr ? <div style={{ fontSize: 11, color: "#F87171", marginTop: 8 }}>{pasteErr}</div> : null}
          <button type="button" onClick={onClose} style={{ marginTop: 14, textAlign: "center", padding: 13, borderRadius: 999, background: "var(--card)", color: "var(--text)", fontWeight: 900, fontSize: 13.5, cursor: "pointer", border: "1.5px solid var(--el)", fontFamily: "inherit", width: "100%" }}>
            Cancel
          </button>
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}
