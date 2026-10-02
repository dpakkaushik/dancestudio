"use client";

import { useId } from "react";

/** The DanceOS mark — lifted from prototype DosMark (DanceOSApp.jsx:1614-1628).
 *  One file since 3 Oct 2026, when the welcome screen began drawing it large in
 *  its middle (the user: "dance os logo on start screen page in the centre");
 *  the top bar draws the same one at 33px, so the two cannot drift. A client
 *  component only for `useId`, which keeps two marks on one page from sharing a
 *  gradient id. */
export function DosMark({ size = 28 }: { size?: number }) {
  const gid = `dm${useId()}`;
  const s = size;
  return (
    <span
      style={{
        display: "inline-flex",
        flexShrink: 0,
        lineHeight: 0,
        width: s,
        height: s,
        borderRadius: s * 0.3,
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(145deg,#1B1030,#0C0714)",
        boxShadow: "0 0 0 1px rgba(236,72,153,.28), 0 4px 14px rgba(124,58,237,.30)",
      }}
    >
      <svg width={s * 0.72} height={s * 0.72} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="#EC4899" />
            <stop offset=".55" stopColor="#A855F7" />
            <stop offset="1" stopColor="#5AC8FA" />
          </linearGradient>
        </defs>
        <path d="M24.8 7.2A12.4 12.4 0 1 0 27.5 20" stroke={`url(#${gid})`} strokeWidth="3.6" strokeLinecap="round" />
        <path d="M9.6 22.6a8 8 0 1 1 11.2-1.4" stroke={`url(#${gid})`} strokeWidth="3.2" strokeLinecap="round" opacity=".62" />
        <circle cx="26.4" cy="6.2" r="3.5" fill="#EC4899" />
      </svg>
    </span>
  );
}
