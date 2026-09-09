"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";

const CARD = "var(--card)";
const EL = "var(--el)";

/** THE ADMIN PANEL'S OWN NAV (10 Sep 2026). A platform admin has no profile
 *  and therefore no tab bar — the app chrome draws it none — so the panel
 *  carries its own way around. Each section says what is waiting on it, because
 *  a number on a door is the only reason to open one.
 *
 *  The sections that do not exist yet are drawn dim and unlinked rather than
 *  hidden: an admin should be able to see the shape of the panel they are
 *  getting, and a missing screen is not a secret. */
export interface AdminBadges {
  verifications?: number;
  support?: number;
  reports?: number;
  money?: number;
}

const SECTIONS: Array<{ href: string; label: string; badge?: keyof AdminBadges; soon?: boolean }> = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/verifications", label: "Verifications", badge: "verifications" },
  { href: "/admin/support", label: "Support", badge: "support" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/businesses", label: "Businesses", soon: true },
  { href: "/admin/reports", label: "Reports", badge: "reports", soon: true },
  { href: "/admin/money", label: "Money", badge: "money", soon: true },
];

export function AdminShell({ badges = {}, children }: { badges?: AdminBadges; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh" }}>
      <nav
        aria-label="Admin sections"
        style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", padding: "12px 16px 10px", borderBottom: `1px solid ${EL}` }}
      >
        {SECTIONS.map((s) => {
          const on = pathname === s.href || (s.href !== "/admin" && pathname.startsWith(`${s.href}/`));
          const count = s.badge ? badges[s.badge] ?? 0 : 0;
          const body = (
            <>
              {s.label}
              {count > 0 ? (
                <span style={{ marginLeft: 5, minWidth: 16, height: 16, borderRadius: 8, padding: "0 4px", background: on ? "rgba(255,255,255,.28)" : "#EC4899", color: "#fff", fontSize: 9.5, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </>
          );
          const style: React.CSSProperties = {
            flex: "0 0 auto",
            display: "inline-flex",
            alignItems: "center",
            padding: "7px 12px",
            borderRadius: 999,
            fontSize: 11.5,
            fontWeight: 800,
            whiteSpace: "nowrap",
            textDecoration: "none",
            background: on ? "var(--text)" : CARD,
            color: on ? "var(--solid)" : s.soon ? "var(--muted)" : SUB,
            border: `1px solid ${on ? "var(--text)" : EL}`,
            opacity: s.soon ? 0.6 : 1,
          };
          return s.soon ? (
            <span key={s.href} aria-disabled="true" title="Coming in a later phase" style={{ ...style, cursor: "default" }}>
              {body}
            </span>
          ) : (
            <Link key={s.href} href={s.href} aria-current={on ? "page" : undefined} style={style}>
              {body}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
