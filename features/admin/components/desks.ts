import type { AdminGlyphKey } from "./admin-glyphs";

/** THE PANEL'S DESKS — the one list both the Overview (a server component) and
 *  the shell (a client component) draw from.
 *
 *  A PLAIN MODULE ON PURPOSE (11 Sep 2026, learned by running it): an export of
 *  a `"use client"` file is not a value when a server component imports it — it
 *  is a client REFERENCE, so `DESKS.map is not a function` and three desks
 *  answered 500. Data that both sides read lives here, with no directive, and
 *  each side imports it. */
export interface AdminBadges {
  verifications?: number;
  support?: number;
  reports?: number;
  money?: number;
  /** refunds somebody is still waiting on — the money desk's own number */
  refunds?: number;
}

export interface AdminDesk {
  href: string;
  label: string;
  /** one line: what the desk is FOR, not what it is called */
  what: string;
  k: AdminGlyphKey;
  badge?: keyof AdminBadges;
  /** the badge is red when it is a person waiting, amber when it is money or a check */
  tone?: string;
}

/** THE ORDER IS THE JOB, NOT THE ALPHABET. The desks that carry work an admin
 *  owes somebody come first — an organization waiting to be verified, a person
 *  waiting for a reply, a report waiting for a decision. Then money, which is
 *  watched rather than worked. Then the registers — who and what exists. Audit
 *  is last because it is read after the fact, never before. */
export const DESKS: AdminDesk[] = [
  /* THE FIGURES ARE A DESK LIKE ANY OTHER (11 Sep 2026, the user's ask: "the
     main screen will only have a designated block for every part of it"). They
     used to sit UNDER the blocks on /admin, which made the front door a long
     scroll and the blocks a header rather than the panel. They have their own
     page now, and their own block. */
  { href: "/admin/dashboard", label: "Dashboard", what: "The platform in figures, and what is stuck", k: "dashboard" },
  { href: "/admin/verifications", label: "Verifications", what: "Organizations asking to be trusted", k: "verifications", badge: "verifications", tone: "#F59E0B" },
  { href: "/admin/support", label: "Support", what: "DanceOS and one account, talking", k: "support", badge: "support", tone: "#F59E0B" },
  { href: "/admin/reports", label: "Reports", what: "What somebody says is wrong", k: "reports", badge: "reports", tone: "#EF4444" },
  { href: "/admin/payments", label: "Money", what: "In, back, and on to trainers", k: "money", badge: "refunds", tone: "#EF4444" },
  { href: "/admin/subscriptions", label: "Subscriptions", what: "Every recurring plan and its state", k: "subscriptions", badge: "money", tone: "#EF4444" },
  { href: "/admin/plans", label: "Plans", what: "What a plan costs, and whether it is on offer", k: "plans" },
  { href: "/admin/communication", label: "Communication", what: "What the platform said, and who read it", k: "communication" },
  { href: "/admin/accounts", label: "Accounts", what: "Every person and organization", k: "accounts" },
  { href: "/admin/businesses", label: "Businesses", what: "Every studio and artist page", k: "businesses" },
  { href: "/admin/audit", label: "Audit", what: "Every decision an admin has made", k: "audit" },
];

export const deskFor = (pathname: string): AdminDesk | null =>
  DESKS.find((d) => pathname === d.href || pathname.startsWith(`${d.href}/`)) ?? null;
