"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getWorkspaceAction, type Workspace } from "@/features/shell/server-actions/workspace";
import { StudioI } from "./shell-glyphs";

/** The "Managing {studio}" strip lifted from the shell (prototype 19267-19294):
 *  a studio is a WORKSPACE you enter from Home, and this strip is the way back
 *  out. It draws on every /business/[tenantId]/* route. The name comes from a
 *  server action keyed on the id in the URL; until it lands the strip already
 *  holds its height so the page under it does not jump. */
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
  const loc = current ? [current.area, current.city].filter(Boolean).join(", ") : "";

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
        {loc ? ` · ${loc}` : ""}
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
