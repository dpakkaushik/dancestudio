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

export function ScanSheet({ onClose, onCode, busy = false, error = null }: { onClose: () => void; onCode: (personId: string) => void; busy?: boolean; error?: string | null }) {
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

  const resolve = useCallback(async (id: string) => {
    setLooking(true);
    setLookErr(null);
    const out = await lookupPersonAction({ userId: id });
    setLooking(false);
    if (!out.person) {
      setLookErr(out.error ?? "Nobody on DanceOS at that link");
      return;
    }
    setFound(out.person);
  }, []);

  /* the camera and the detector live exactly as long as the sheet does; every
     state write below happens in an async callback, never in the effect body */
  useEffect(() => {
    if (!supported) return;
    const Ctor = detectorCtor();
    if (!Ctor) return;
    let live = true;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let found = false;
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
          if (!el || found || el.readyState < 2) return;
          try {
            const codes = await detector.detect(el);
            const id = codes.map((c) => personIdFromText(c.rawValue)).find(Boolean);
            if (id && live && !found) {
              /* ⚠ ONE decode wins and the camera stops mattering: the sheet
                 moves to the confirm card, and nothing is written until the
                 person holding the phone says so. */
              found = true;
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
          <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 10 }}>{found ? "Is this them?" : "Their DanceOS code"}</div>

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
                  looking somebody up does not throw away the scan you just made */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <Link href={`/person/${found.id}`} target="_blank" rel="noreferrer" aria-label={`View ${found.fullName}'s profile`} style={{ textAlign: "center", padding: "11px 8px", borderRadius: 12, background: "var(--card)", border: "1.5px solid var(--el)", color: "var(--text)", fontSize: 12, fontWeight: 900, textDecoration: "none" }}>
                  View profile
                </Link>
                <Link href={`/person/${found.id}/stats`} target="_blank" rel="noreferrer" aria-label={`${found.fullName}'s record and rank`} style={{ textAlign: "center", padding: "11px 8px", borderRadius: 12, background: "var(--card)", border: "1.5px solid var(--el)", color: "var(--text)", fontSize: 12, fontWeight: 900, textDecoration: "none" }}>
                  Stats
                </Link>
              </div>
              {error ? <div role="alert" style={{ fontSize: 11, color: "#F87171", marginBottom: 10, fontWeight: 700 }}>{error}</div> : null}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => { setFound(null); setLookErr(null); }}
                  disabled={busy}
                  aria-label="Not them — scan again"
                  style={{ flex: 1, padding: 13, borderRadius: 999, background: "var(--card)", color: "var(--text)", fontWeight: 900, fontSize: 13.5, cursor: busy ? "not-allowed" : "pointer", border: "1.5px solid var(--el)", fontFamily: "inherit" }}
                >
                  Not them
                </button>
                <button
                  type="button"
                  onClick={() => onCode(found.id)}
                  disabled={busy}
                  aria-label={`Confirm ${found.fullName}`}
                  style={{ flex: 1, padding: 13, borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 13.5, cursor: busy ? "not-allowed" : "pointer", border: "none", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}
                >
                  {busy ? "Confirming…" : "Confirm"}
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
