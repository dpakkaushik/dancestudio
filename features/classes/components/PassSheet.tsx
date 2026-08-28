"use client";

import { QRBlock } from "@/components/ui/QRBlock";
import { DOS_DISPLAY, DOS_UI } from "@/lib/design/tokens";
import { PosterBlock } from "./poster";
import { dosKey } from "./ShareSheet";

/** A TICKET — lifted from prototype PassSheet (DanceOSApp.jsx:6161-6227): a stub
 *  with an outline, a torn edge and two notches. The top half is what you are
 *  going to; the bottom half is how you get in. Sharing, the booking QR and the
 *  entry code all live here, behind the poster — one place instead of three
 *  (12001). Booked viewers see their entry code; everyone else sees the booking
 *  link. Real scanning arrives with the QR work later; the code text is real. */

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/* the drawn code square now lives in components/ui/QRBlock (Step 12b) — a staff
   invite wears the same one */

export interface PassCode {
  /** what the QR encodes and the mono line prints — an entry code or the booking link */
  code: string;
  label: string;
  note: string;
}

export interface PassSheetProps {
  posterItem: { title: string; style: string; styleColor: string };
  posterK: string;
  col: string;
  title: string;
  styleName: string;
  levelWord: string;
  pass: PassCode;
  /** the booking-link slug — Share copies this deployment's full /c/{slug} URL
   *  (or /e/{slug} for an event, Step 21) */
  slug: string;
  /** which public address the slug lives at — classes at /c, events at /e */
  path?: "c" | "e";
  /** the dialog's name — "Class pass" unless the ticket is for something else */
  ariaLabel?: string;
  onClose: () => void;
  fire: (msg: string) => void;
}

export function PassSheet({ posterItem, posterK, col, title, styleName, levelWord, pass, slug, path = "c", ariaLabel = "Class pass", onClose, fire }: PassSheetProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.72)",
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
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          background: "var(--solid)",
          color: "var(--text)",
          borderRadius: 20,
          border: `1.5px solid ${col}55`,
          padding: "14px 16px 18px",
          width: "100%",
          maxWidth: 302,
          boxSizing: "border-box",
          maxHeight: "90vh",
          overflowY: "auto",
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,.6)",
          fontFamily: DOS_UI,
        }}
      >
        {/* the sleeve — the art, with the dance style riding its TOP edge */}
        <div style={{ position: "relative", display: "inline-block", lineHeight: 0, marginTop: 14 }}>
          <PosterBlock item={posterItem} design={posterK} size={228} />
          <span
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              transform: "translate(-50%,-50%)",
              lineHeight: 0,
              borderRadius: 999,
              boxShadow: "0 0 0 3px var(--solid), 0 3px 10px rgba(0,0,0,.5)",
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
            marginTop: 12,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--muted)", marginTop: 3 }}>
          {[styleName, levelWord].filter(Boolean).join(" · ")}
        </div>
        {/* the tear: two notches punched into the sides, a dashed line between them */}
        <div style={{ position: "relative", height: 1, margin: "16px -16px", borderTop: "1.5px dashed var(--el)" }}>
          <span style={{ position: "absolute", left: -9, top: -9, width: 18, height: 18, borderRadius: 9, background: "rgba(0,0,0,.72)" }} />
          <span style={{ position: "absolute", right: -9, top: -9, width: 18, height: 18, borderRadius: 9, background: "rgba(0,0,0,.72)" }} />
        </div>
        <div style={{ display: "inline-block", lineHeight: 0 }}>
          <QRBlock code={pass.code} size={168} label={pass.label} />
        </div>
        <div style={{ fontFamily: DOS_MONO, fontSize: 11.5, fontWeight: 700, color: "var(--text)", marginTop: 10, wordBreak: "break-all" }}>
          {pass.code}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 3 }}>{pass.note}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <div
            role="button"
            tabIndex={0}
            onKeyDown={dosKey}
            onClick={() => {
              const full = `${window.location.protocol}//${window.location.host}/${path}/${slug}`;
              try {
                if (navigator.clipboard?.writeText) navigator.clipboard.writeText(full);
              } catch {
                /* clipboard blocked — the link is on screen to copy by hand */
              }
              fire("🔗 Link copied");
            }}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "center",
              padding: "11px 6px",
              borderRadius: 999,
              background: "var(--card)",
              border: "1px solid var(--el)",
              fontWeight: 800,
              fontSize: 11.5,
              cursor: "pointer",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Share
          </div>
        </div>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={dosKey}
          onClick={onClose}
          style={{
            marginTop: 8,
            textAlign: "center",
            padding: "12px",
            borderRadius: 999,
            background: "var(--text)",
            color: "var(--solid)",
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
