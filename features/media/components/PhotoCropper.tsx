"use client";

import NextImage from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type TouchEvent } from "react";
import { Portal } from "@/components/ui/Portal";
import { DISC_RADIUS, DOS_UI, HERO_HEAD_H, HERO_HEAD_RADIUS, HERO_HEAD_W } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import type { PhotoOwner } from "@/lib/media/photo";

/** THE CROPPER — the prototype's `DosCropper` (DanceOSApp.jsx:2275-2426), lifted
 *  (18 Sep 2026, the user: "every photo uploaded in the app should have a way to
 *  crop and preview it according to the layout of the photo in the app").
 *
 *  Every upload in this app is one of TWO shapes — the profile picture, a 1:1
 *  squircle, and the BANNER a header picture, a poster or a crew's photo lands in
 *  — so this is one cropper with two frames, and the frame IS the preview: it is
 *  masked to the shape the picture will be drawn in, so what you see inside it is
 *  exactly what the page will show. Zoom with the slider, drag to choose what
 *  stays, or press "Fill the frame" / "Whole picture". The output is a JPEG
 *  (640² for a disc, 1080×720 for a banner), which also means a 5 MB phone photo
 *  goes up as a few hundred kilobytes.
 *
 *  ⚠⚠ THE BANNER IS NOT SQUARE ANY MORE (28 Sep 2026), and the frame is where
 *  that had to be said: it reads `HERO_HEAD_W / HERO_HEAD_H` — the same two
 *  tokens the hero rail and the Discover card read — so the cut and the three
 *  places it is DRAWN are one ratio by construction rather than by three numbers
 *  agreeing. The key was called `square` until today and is `banner` now, because
 *  a key that names the wrong shape is the lie this repo keeps paying for.
 *  ⚠ Every geometry helper here therefore takes a WIDTH AND A HEIGHT: `W` used to
 *  be both, and a cropper that assumes its frame is square cuts a rectangle
 *  wrong in a way nothing but an eye would catch.
 *
 *  Three things the prototype learned the hard way are kept on purpose:
 *  * IT WILL NOT CUT BEFORE THE PICTURE HAS DECODED. The picture is loaded
 *    separately and that loaded object is what the canvas draws from, so "ready"
 *    means ready. Reading the size off the <img>'s load event loses the race
 *    whenever the file is already decoded.
 *  * BUT IT WILL NOT TRAP YOU EITHER. After 1.2 s without a decode the button
 *    changes to "Use it as it is" and hands the original file through untouched,
 *    rather than sitting on "Opening…" for ever.
 *  * IT STEPS THROUGH SEVERAL. The verification form takes five photos at once,
 *    so the cropper is a queue: CROP & PREVIEW · 2 of 5, one press per picture,
 *    and the caller gets every cropped file back in one list at the end. Cancel
 *    at any step drops the whole batch — half a batch is not what anybody meant.
 *
 *  It renders through `Portal`: a modal belongs at the root of the document, and
 *  this one opens from inside Edit sheets that are themselves portalled — the
 *  16 Sep stacking-context lesson. Each picture is its own `Stage`, keyed on its
 *  place in the queue, so a new picture starts from fresh state rather than being
 *  reset in an effect (this repo's lint refuses setState in an effect body). */

export type CropFrame = "disc" | "banner";

/** the banner's preview box and its output, both at the hero's own ratio */
const BANNER_W = 320;
const BANNER_OUT_W = 1080;
const ratio = (w: number) => Math.round((w * HERO_HEAD_H) / HERO_HEAD_W);

const FRAME: Record<CropFrame, { w: number; h: number; outW: number; outH: number; round: string | number; name: string }> = {
  /* the squircle the ProfileDisc draws — the crop shows the picture in it */
  disc: { w: 262, h: 262, outW: 640, outH: 640, round: `${DISC_RADIUS * 100}%`, name: "Profile photo" },
  /* the banner's own corners and its own shape, both read from the tokens */
  banner: { w: BANNER_W, h: ratio(BANNER_W), outW: BANNER_OUT_W, outH: ratio(BANNER_OUT_W), round: HERO_HEAD_RADIUS, name: "Photo" },
};

const JPEG_QUALITY = 0.88;
const STUCK_AFTER_MS = 1200;
const MAX_ZOOM_FLOOR = 3;

type Size = { w: number; h: number };
type Pt = { x: number; y: number };

/** the cropped picture as a File the upload path can take: the same base name, .jpg */
const toJpegFile = (blob: Blob, original: File): File =>
  new File([blob], `${original.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" });

/** THE ENCODE HAS A DEADLINE (18 Sep 2026). `toBlob` answers on its own schedule
 *  — off the main thread, back on it when done — and on one machine tonight it
 *  answered in 400 ms four times and then not for five seconds, with nothing to
 *  explain the difference. "Saving…" must never be a wait without an end: past
 *  the deadline the picture goes up uncropped rather than not at all, which is
 *  the same rule the decode already follows ("Use it as it is"). */
const ENCODE_DEADLINE_MS = 4000;
const canvasToBlob = (c: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => {
    let done = false;
    const finish = (b: Blob | null) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve(b);
    };
    const t = setTimeout(() => finish(null), ENCODE_DEADLINE_MS);
    try {
      c.toBlob((b) => finish(b), "image/jpeg", JPEG_QUALITY);
    } catch {
      finish(null);
    }
  });

/** THE BLURRED BACKFILL, CHEAPLY. A canvas `filter: blur(26px)` over the whole
 *  760px output is the one expensive line in the export — a wide Gaussian over
 *  half a million pixels in software. The same look for a fraction of the work:
 *  the picture drawn into a thumbnail of a few dozen pixels, then that thumbnail
 *  drawn back up with smoothing on. What the eye sees is the same soft wash. */
const BACKFILL_PX = 28;
const drawBackfill = (g: CanvasRenderingContext2D, img: HTMLImageElement, nat: Size, out: Size, scale: number) => {
  const tiny = document.createElement("canvas");
  tiny.width = BACKFILL_PX;
  tiny.height = Math.max(1, Math.round((BACKFILL_PX * out.h) / out.w));
  const tg = tiny.getContext("2d");
  if (!tg) return;
  /* cover the tiny frame with the picture, centred, the way the fill would */
  const s = Math.max(tiny.width / nat.w, tiny.height / nat.h) * scale;
  tg.drawImage(img, (tiny.width - nat.w * s) / 2, (tiny.height - nat.h * s) / 2, nat.w * s, nat.h * s);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "low";
  g.drawImage(tiny, 0, 0, out.w, out.h);
  /* a touch of the ground so the wash reads as behind the picture, not as it */
  g.fillStyle = "rgba(11,11,12,.35)";
  g.fillRect(0, 0, out.w, out.h);
};

/* the whole geometry, in one place: fit = the picture entirely inside the frame,
   fill = the picture covering it; the preview, the clamp and the canvas all read it.
   ⚠ W and H are two numbers (28 Sep 2026) — they were one until the banner stopped
   being square, and every one of these would have cut the wrong rectangle. */
const fitOf = (nat: Size | null, W: number, H: number) => (nat ? Math.min(W / nat.w, H / nat.h) : 1);
const fillOf = (nat: Size | null, W: number, H: number) => (nat ? Math.max(W / nat.w, H / nat.h) : 1);

/** you may move the picture anywhere that keeps it touching the frame — far
 *  enough to put any corner under the crop, never so far the frame sees nothing */
const clampOff = (o: Pt, z: number, nat: Size | null, W: number, H: number): Pt => {
  if (!nat) return o;
  const s = fitOf(nat, W, H) * z;
  const w = nat.w * s;
  const h = nat.h * s;
  const lx = Math.max(0, (w - W) / 2);
  const ly = Math.max(0, (h - H) / 2);
  const fx = w < W ? (W - w) / 2 : 0;
  const fy = h < H ? (H - h) / 2 : 0;
  return { x: Math.max(-lx - fx, Math.min(lx + fx, o.x)), y: Math.max(-ly - fy, Math.min(ly + fy, o.y)) };
};

const pointOf = (e: MouseEvent | TouchEvent): Pt => {
  const t = "touches" in e ? e.touches[0] : e;
  return { x: t.clientX, y: t.clientY };
};

export function PhotoCropper({
  files,
  frame,
  label,
  onDone,
  onCancel,
}: {
  /** what was picked — one, or a batch; the cropper steps through them */
  files: File[];
  frame: CropFrame;
  /** the sheet's own title — "Profile photo", "Header picture", … */
  label?: string;
  /** every file, cropped, in the order it was picked */
  onDone: (cropped: File[]) => void;
  onCancel: () => void;
}) {
  const [i, setI] = useState(0);
  const [out, setOut] = useState<File[]>([]);
  useCloseOnBack(onCancel, true);

  const file = files[i];
  if (!file) return null;
  const title = label ?? FRAME[frame].name;
  const step = files.length > 1 ? `${i + 1} of ${files.length}` : null;

  /* hand THIS picture on and step to the next, or finish */
  const advance = (f: File) => {
    const next = [...out, f];
    if (i + 1 < files.length) {
      setOut(next);
      setI(i + 1);
    } else {
      onDone(next);
    }
  };

  return (
    <Portal>
      <div
        onClick={onCancel}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 700, fontFamily: DOS_UI }}
      >
        <style>{`.dosZoom{-webkit-appearance:none;appearance:none;height:4px;border-radius:2px;background:var(--el);outline:none}
.dosZoom::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:11px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.45);cursor:pointer}`}</style>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Crop & preview"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "var(--solid)",
            color: "var(--text)",
            borderRadius: "24px 24px 0 0",
            padding: "14px 16px calc(24px + var(--dos-safe-bottom, 0px))",
            width: "100%",
            maxWidth: 430,
            boxSizing: "border-box",
            animation: "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)",
          }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.2, color: "var(--muted)" }}>
            CROP &amp; PREVIEW{step ? ` · ${step}` : ""}
          </div>
          <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 2 }}>{title}</div>
          <Stage key={`${i}-${file.name}-${file.size}`} file={file} frame={frame} onCancel={onCancel} onUse={advance} />
        </div>
      </div>
    </Portal>
  );
}

/** ONE PICTURE IN THE FRAME. Mounted fresh per picture (keyed by the queue), so
 *  its zoom, its offset and its decode are its own and nothing is reset by hand. */
function Stage({ file, frame, onCancel, onUse }: { file: File; frame: CropFrame; onCancel: () => void; onUse: (f: File) => void }) {
  const S = FRAME[frame];
  const W = S.w;
  const H = S.h;

  /* one object URL per picture, revoked when the stage goes */
  const src = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(src), [src]);

  /* {w,h} once THIS picture has actually decoded — see the header comment */
  const [nat, setNat] = useState<Size | null>(null);
  const [z, setZ] = useState(1);
  const [off, setOff] = useState<Pt>({ x: 0, y: 0 });
  const [stuck, setStuck] = useState(false);
  const [saving, setSaving] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ p: Pt; o: Pt } | null>(null);

  /* WAITING FOR THE PICTURE — loaded deliberately, into the object the canvas
     will draw from. The load event is always dispatched asynchronously, so the
     handler is the one place the size is read. */
  useEffect(() => {
    let dead = false;
    const im = new window.Image();
    im.onload = () => {
      if (dead) return;
      if (im.naturalWidth && im.naturalHeight) {
        imgRef.current = im;
        setNat({ w: im.naturalWidth, h: im.naturalHeight });
      } else {
        setStuck(true);
      }
    };
    im.onerror = () => {
      if (!dead) setStuck(true);
    };
    im.src = src;
    const t = setTimeout(() => {
      if (!dead) setStuck(true);
    }, STUCK_AFTER_MS);
    return () => {
      dead = true;
      clearTimeout(t);
      im.onload = null;
      im.onerror = null;
    };
  }, [src]);

  const fit = fitOf(nat, W, H);
  const fill = fillOf(nat, W, H);
  const maxZ = nat ? Math.max(MAX_ZOOM_FLOOR, (fill / fit) * 2.5) : MAX_ZOOM_FLOOR;
  const s = fit * z;
  const P = { w: (nat ? nat.w : W) * s, h: (nat ? nat.h : H) * s, x: 0, y: 0 };
  P.x = (W - P.w) / 2 + off.x;
  P.y = (H - P.h) / 2 + off.y;

  const zoomTo = (nz: number, reset = false) => {
    setZ(nz);
    setOff((o) => (reset ? { x: 0, y: 0 } : clampOff(o, nz, nat, W, H)));
  };
  const down = (e: MouseEvent | TouchEvent) => {
    drag.current = { p: pointOf(e), o: { ...off } };
  };
  const move = (e: MouseEvent | TouchEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = pointOf(e);
    setOff(clampOff({ x: d.o.x + (p.x - d.p.x), y: d.o.y + (p.y - d.p.y) }, z, nat, W, H));
  };
  const up = () => {
    drag.current = null;
  };

  const apply = async () => {
    if (saving) return;
    const img = imgRef.current;
    /* USE IT AS IT IS — a picture that would not decode is passed through, never cut blind */
    if (!nat || !img) {
      onUse(file);
      return;
    }
    setSaving(true);
    try {
      const c = document.createElement("canvas");
      c.width = S.outW;
      c.height = S.outH;
      const g = c.getContext("2d");
      if (!g) {
        onUse(file);
        return;
      }
      /* the preview and the output are the same shape, so one scale carries both */
      const k = S.outW / W;
      /* whatever the frame is not covering gets the picture itself, blown up and
         blurred, rather than a black bar — the prototype's own trick */
      g.fillStyle = "#0B0B0C";
      g.fillRect(0, 0, c.width, c.height);
      try {
        drawBackfill(g, img, nat, { w: S.outW, h: S.outH }, 1.25);
      } catch {
        /* the picture on the plain ground is fine; the wash is decoration */
      }
      g.drawImage(img, P.x * k, P.y * k, P.w * k, P.h * k);
      const blob = await canvasToBlob(c);
      onUse(blob && blob.size > 200 ? toJpegFile(blob, file) : file);
    } catch {
      onUse(file);
    } finally {
      setSaving(false);
    }
  };

  const ready = nat !== null;
  const can = ready || stuck;
  const pill = (on: boolean): CSSProperties => ({
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: 800,
    padding: "9px 6px",
    borderRadius: 11,
    cursor: ready ? "pointer" : "default",
    background: on ? "var(--el)" : "var(--card)",
    border: `1.5px solid ${on ? "var(--text)" : "var(--el)"}`,
    color: on ? "var(--text)" : "var(--sub)",
    opacity: ready ? 1 : 0.5,
    fontFamily: "inherit",
  });

  return (
    <>
      <div style={{ fontSize: 10.5, color: "var(--sub)", marginBottom: 12 }}>
        {ready ? "The whole picture is here. Zoom in and drag to choose what stays." : stuck ? "That picture would not open — it can go up as it is." : "Opening your picture…"}
      </div>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          onMouseDown={down}
          onMouseMove={move}
          onMouseUp={up}
          onMouseLeave={up}
          onTouchStart={down}
          onTouchMove={move}
          onTouchEnd={up}
          aria-label="Drag to choose the crop"
          style={{
            width: W,
            height: H,
            position: "relative",
            overflow: "hidden",
            flexShrink: 0,
            cursor: ready ? "grab" : "progress",
            touchAction: "none",
            borderRadius: S.round,
            background: "#111",
            boxShadow: "0 8px 26px rgba(0,0,0,.5)",
          }}
        >
          {/* a local object URL positioned by hand — nothing for the optimizer to do */}
          <NextImage
            src={src}
            alt=""
            width={Math.max(1, Math.round(P.w))}
            height={Math.max(1, Math.round(P.h))}
            unoptimized
            priority
            draggable={false}
            style={{ position: "absolute", left: P.x, top: P.y, width: P.w, height: P.h, maxWidth: "none", userSelect: "none", WebkitUserSelect: "none", pointerEvents: "none", opacity: ready ? 1 : 0 }}
          />
          {/* the frame's own edge, drawn over the picture so it never crops what you can see */}
          <span aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: S.round, border: "1.5px solid rgba(255,255,255,.28)", pointerEvents: "none" }} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 2px 4px" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--sub)" }}>−</span>
        <input
          className="dosZoom"
          type="range"
          min="1"
          max={maxZ.toFixed(2)}
          step="0.01"
          value={z}
          aria-label="Zoom"
          disabled={!ready}
          onChange={(e) => zoomTo(parseFloat(e.target.value))}
          style={{ flex: 1, opacity: ready ? 1 : 0.4 }}
        />
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--sub)" }}>＋</span>
      </div>
      <div style={{ display: "flex", gap: 8, margin: "6px 0 2px" }}>
        <button type="button" aria-label="Whole picture" disabled={!ready} onClick={() => zoomTo(1, true)} style={pill(z <= 1.001)}>
          Whole picture
        </button>
        <button type="button" aria-label="Fill the frame" disabled={!ready} onClick={() => zoomTo(fill / fit, true)} style={pill(z > 1.001)}>
          Fill the frame
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel cropping"
          style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: 999, background: "var(--card)", border: "1.5px solid var(--el)", color: "var(--text)", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}
        >
          Cancel
        </button>
        {/* ONE NAME for the harness whatever the shape: "Use this photo". A real
            `disabled` while the picture decodes, so a test that presses it simply
            waits for the decode rather than racing it. */}
        <button
          type="button"
          disabled={!can || saving}
          onClick={() => void apply()}
          aria-label={stuck && !ready ? "Use it as it is" : "Use this photo"}
          style={{
            flex: 1.3,
            textAlign: "center",
            padding: 13,
            borderRadius: 999,
            border: "none",
            background: can ? "var(--text)" : "var(--el)",
            color: can ? "var(--solid)" : "var(--muted)",
            fontWeight: 900,
            fontSize: 13.5,
            cursor: can ? "pointer" : "default",
            fontFamily: "inherit",
          }}
        >
          {saving ? "Saving…" : ready ? "Use this photo" : stuck ? "Use it as it is" : "Opening…"}
        </button>
      </div>
    </>
  );
}

/** which frame an owner's picture is drawn in — the disc for a person's or a
 *  business's profile picture, a square for everything else */
/* ⚠ an ASSET is a squircle since 4 Oct 2026 (the user: "photo upload option in
   squircle 1 photo only") — its card draws it as the card's face, the same
   shape as a profile's disc */
export const frameForOwnerKind = (kind: PhotoOwner["kind"]): CropFrame => (kind === "avatar" || kind === "business" || kind === "asset" ? "disc" : "banner");
