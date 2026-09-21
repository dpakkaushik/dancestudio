"use client";

import { useEffect, useRef, useState } from "react";
import { Portal } from "@/components/ui/Portal";
import { DOS_UI } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";

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
              found = true;
              onCode(id);
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
  }, [supported, onCode]);

  const usePasted = () => {
    const id = personIdFromText(pasted);
    if (!id) {
      setPasteErr("That is not a DanceOS profile link.");
      return;
    }
    setPasteErr(null);
    onCode(id);
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
          <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 10 }}>Their DanceOS code</div>
          {supported && status !== "denied" ? (
            <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", background: "#000", aspectRatio: "1 / 1", maxHeight: 320, marginBottom: 10 }}>
              {/* the camera's own picture; muted and inline so a phone does not open a player */}
              <video ref={video} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <div aria-hidden="true" style={{ position: "absolute", inset: "14%", border: "2px solid rgba(255,255,255,.85)", borderRadius: 18, boxShadow: "0 0 0 999px rgba(0,0,0,.28)" }} />
            </div>
          ) : null}
          <div role="status" style={{ fontSize: 11.5, color: busy ? "var(--text)" : "var(--sub)", marginBottom: 12 }}>
            {busy ? "Looking them up…" : line}
          </div>
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
        </div>
      </div>
    </Portal>
  );
}
