"use client";

import type { CSSProperties } from "react";
import { toolBtn } from "@/components/ui/ToolCard";

/** THE SONG AND THE VIDEO AS REAL BUTTONS — one pair for the routine card on the
 *  desk and the routine's own page (3 Oct 2026), so a routine's media look and
 *  answer the same wherever they are pressed.
 *
 *  ⚠ INK on a ring of the style's colour, never white ON it: a style colour can
 *  be a light one (Bhangra's yellow).
 *  ⚠ `stopPropagation`, because on the desk the button sits inside a card that
 *  opens on a press — the button is its own link (C117's stretched-link rule). */
export function RoutineMediaButton({
  kind,
  href,
  word,
  title,
  col,
  extra,
}: {
  kind: "song" | "video";
  href: string | null;
  word: string;
  /** the routine's name — the link's accessible name says which routine */
  title: string;
  col: string;
  extra?: CSSProperties;
}) {
  const icon =
    kind === "song" ? (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 18V5l11-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="17" cy="16" r="3" />
      </svg>
    ) : (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z" />
      </svg>
    );
  const box: CSSProperties = href
    ? toolBtn("secondary", col, { borderColor: `${col}99`, background: `${col}12`, ...extra })
    : toolBtn("secondary", col, { color: "var(--muted)", cursor: "default", ...extra });
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`Open the ${kind} for ${title}`} style={box}>
      {icon}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{word}</span>
    </a>
  ) : (
    <span style={box}>
      {icon}
      No {kind}
    </span>
  );
}
