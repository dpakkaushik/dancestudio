"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { AdminGlyph, DESK_TINT } from "./admin-glyphs";
import { deskFor, type AdminBadges } from "./desks";

export type { AdminBadges, AdminDesk } from "./desks";

const CARD = "var(--card)";
const EL = "var(--el)";

/** THE ADMIN PANEL'S OWN NAV, SECOND CUT (11 Sep 2026). A platform admin has
 *  no profile and therefore no tab bar, so the panel carries its own way around
 *  — and the first cut was a row of pills that scrolled off the side of a
 *  phone, which the user rejected in as many words: "the top sliding bar items
 *  doesn't what I want… rather give me boxes, block type views and an
 *  image/icon for each block".
 *
 *  So the OVERVIEW IS THE NAV: /admin opens on a grid of blocks, one per desk,
 *  each with its icon and the number waiting on it (AdminDashboard). Inside a
 *  desk there is no row of every other desk — only a slim line saying which
 *  desk this is and the one door back to all of them. The chrome's own back
 *  arrow does history; this does intent. The list of desks itself lives in
 *  `desks.ts`, because the Overview is a server component and a value exported
 *  from a client file is not a value on the server. */
export function AdminShell({ badges = {}, children }: { badges?: AdminBadges; children: ReactNode }) {
  const pathname = usePathname();
  const desk = deskFor(pathname);
  const count = desk?.badge ? badges[desk.badge] ?? 0 : 0;

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh" }}>
      {desk ? (
        <nav aria-label="Admin sections" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px 6px" }}>
          <Link
            href="/admin"
            aria-label="All desks"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 11px 0 8px", borderRadius: 999, background: CARD, border: `1px solid ${EL}`, color: SUB, fontSize: 11, fontWeight: 800, textDecoration: "none", flexShrink: 0 }}
          >
            <span aria-hidden="true" style={{ display: "inline-flex", color: SUB }}>
              <AdminGlyph k="overview" size={14} />
            </span>
            All desks
          </Link>
          <span style={{ flex: 1, minWidth: 0, display: "inline-flex", alignItems: "center", gap: 7, justifyContent: "flex-end" }}>
            <span aria-hidden="true" style={{ display: "inline-flex", color: DESK_TINT[desk.k] }}>
              <AdminGlyph k={desk.k} size={15} />
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 900, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{desk.label}</span>
            {count > 0 ? (
              <span style={{ minWidth: 17, height: 17, borderRadius: 9, padding: "0 5px", background: desk.tone ?? "#EC4899", color: "#fff", fontSize: 9.5, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </span>
        </nav>
      ) : null}
      {children}
    </div>
  );
}
