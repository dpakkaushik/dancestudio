"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getWorkspaceAction, type Workspace } from "@/features/shell/server-actions/workspace";
import { StudioI } from "./shell-glyphs";

/** The "Managing {studio}" strip lifted from the shell (prototype 19267-19294):
 *  a studio is a WORKSPACE you enter from Home, and this strip is the way back
 *  out. It draws on every /business/[tenantId]/SOMETHING route — never on the
 *  studio's own home, where the hero says all of this at full size (16 Sep
 *  2026). The name comes from a server action keyed on the id in the URL; until
 *  it lands the strip already holds its height so the page under it does not
 *  jump.
 *
 *  THE NAME, AND ONLY THE NAME (16 Sep 2026). It used to print the area and the
 *  city after it, which made the line the widest thing on a desk and answered a
 *  question nobody standing on a class register is asking: what an address
 *  cannot tell you is WHICH of an organization's studios this register belongs
 *  to, and the name can.
 *
 *  Exit studio stays, and it is not the back button in different clothes: back
 *  retraces the last page (from Add class that is the register, then the home,
 *  then the hub — three presses), and in the installed TWA a deep link opened
 *  straight onto a desk has no history to retrace at all. This is one press to
 *  the studio list, from anywhere inside the workspace. */
export function WorkspaceStrip({ tenantId }: { tenantId: string }) {
  const [ws, setWs] = useState<{ id: string; data: Workspace | null } | null>(null);

  useEffect(() => {
    let alive = true;
    getWorkspaceAction({ tenantId }).then((data) => {
      if (alive) setWs({ id: tenantId, data });
    });
    return () => {
      alive = false;
    };
  }, [tenantId]);

  /* a name from a previous studio must not be printed over this one */
  const current = ws && ws.id === tenantId ? ws.data : null;

  return (
    <div
      style={{
        maxWidth: 430,
        margin: "0 auto",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: "rgba(59,130,246,.13)",
        borderBottom: "1px solid rgba(59,130,246,.32)",
      }}
    >
      <StudioI size={17} color="#3B82F6" />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12.5,
          fontWeight: 800,
          color: "var(--sub)",
          lineHeight: 1.25,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        Managing{" "}
        <b style={{ color: "var(--text)", fontSize: 13.5 }}>{current ? current.name : "…"}</b>
      </span>
      <Link
        href="/business"
        aria-label="Leave this studio and go back to your own profile"
        style={{
          flexShrink: 0,
          minHeight: 34,
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "8px 14px",
          borderRadius: 999,
          fontSize: 12.5,
          fontWeight: 900,
          cursor: "pointer",
          color: "#3B82F6",
          background: "rgba(59,130,246,.14)",
          border: "1.5px solid rgba(59,130,246,.55)",
          WebkitTapHighlightColor: "transparent",
          textDecoration: "none",
          boxSizing: "border-box",
        }}
      >
        Exit studio ›
      </Link>
    </div>
  );
}
