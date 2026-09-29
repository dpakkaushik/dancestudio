"use client";

import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { DOS_DISPLAY, DOS_UI } from "@/lib/design/tokens";
import { PosterBlock, type PosterItem } from "./poster";
import { dosKey } from "./ShareSheet";

/** THE POSTER, OPENED — and nothing else on it (29 Sep 2026, the user: "when
 *  clicking on the poster right now we get poster and a qr code for the class
 *  which should not happen — should just open poster in that").
 *
 *  Pressing the poster used to open `PassSheet`: the art, a torn edge, a QR and
 *  an entry code. That sheet carried three jobs at once because on 24 Aug the
 *  poster became the one control for all three ("one place instead of three",
 *  prototype 12001) — and the cost was that the obvious act, *look at the
 *  poster*, was the one thing it did not do. Sharing is a block in the details
 *  now and entry is the person's own profile code, so this sheet has one job.
 *
 *  ⚠ It takes the whole `PosterItem`, so an UPLOADED poster opens as the
 *  picture it is — `PassSheet` typed its own narrower shape and silently drew
 *  the drawn design over somebody's photograph. */
export function PosterSheet({
  posterItem,
  posterK,
  col,
  title,
  styleName,
  levelWord,
  onClose,
}: {
  posterItem: PosterItem;
  posterK: string;
  col: string;
  title: string;
  styleName: string;
  levelWord: string;
  onClose: () => void;
}) {
  useCloseOnBack(onClose);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.82)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 640,
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Poster for ${title}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 330,
          boxSizing: "border-box",
          textAlign: "center",
          fontFamily: DOS_UI,
          color: "#fff",
        }}
      >
        {/* the art at the size a poster is worth opening for, with the dance
            riding its top edge — the sleeve's own pill, on the scrim */}
        <div style={{ position: "relative", display: "inline-block", lineHeight: 0, marginTop: 14 }}>
          <span
            style={{
              display: "block",
              lineHeight: 0,
              boxShadow: "0 24px 70px rgba(0,0,0,.8), 0 0 60px 18px rgba(0,0,0,.5)",
            }}
          >
            <PosterBlock item={posterItem} design={posterK} size={298} />
          </span>
          <span
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              transform: "translate(-50%,-50%)",
              lineHeight: 0,
              borderRadius: 999,
              boxShadow: "0 3px 10px rgba(0,0,0,.6)",
            }}
          >
            <span
              style={{
                display: "inline-block",
                padding: "6px 13px",
                borderRadius: 999,
                background: col,
                color: "#fff",
                fontSize: 11.5,
                fontWeight: 900,
                fontFamily: DOS_DISPLAY,
                letterSpacing: -0.2,
                whiteSpace: "nowrap",
                lineHeight: 1.1,
              }}
            >
              {styleName}
            </span>
          </span>
        </div>
        <div
          style={{
            fontSize: 19,
            fontWeight: 800,
            letterSpacing: -0.5,
            fontFamily: DOS_DISPLAY,
            marginTop: 14,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "rgba(255,255,255,.66)", marginTop: 3 }}>
          {[styleName, levelWord].filter(Boolean).join(" · ")}
        </div>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={dosKey}
          onClick={onClose}
          style={{
            marginTop: 18,
            textAlign: "center",
            padding: "12px",
            borderRadius: 999,
            background: "#fff",
            color: "#0A0A0A",
            fontWeight: 900,
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          Done
        </div>
      </div>
    </div>
  );
}
