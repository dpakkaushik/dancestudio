import type { ReactNode } from "react";
import { PLAN_RIGHTS, PLAN_RIGHTS_NOTE, type PlanIconKey, type PlanKind } from "@/features/settings/planRights";

/** WHAT THIS SUBSCRIPTION BUYS — one list, both plans (27 Sep 2026, re-cut 4 Oct
 *  2026, the user: "fix lower part of subscriptions with details about what the
 *  subscription gives should be similar looking with new similar looking icons
 *  and explaining all parts in pointers with short details … for both studio and
 *  artist subscriptions").
 *
 *  ⚠ ONE COMPONENT FOR BOTH. The artist's card drew its rights as emoji and a
 *  title; the studio's page drew a separate "What it buys" box with a sub-line —
 *  two looks for one idea. It is the same list inside each card now: a drawn line
 *  icon in the plan's colour, a bold title, one short line under it, and the one
 *  sentence on what cancelling does. Same `PLAN_RIGHTS` rows, so the two cannot
 *  drift in what they PROMISE either. */

/** one line-icon family: 24-unit box, 1.8 stroke, round caps — the AmenityIcon grammar */
function PlanIcon({ k, color }: { k: PlanIconKey; color: string }) {
  const paths: Record<PlanIconKey, ReactNode> = {
    profile: (
      <>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 19.5c1.2-3.3 3.9-5 7-5s5.8 1.7 7 5" />
      </>
    ),
    classes: (
      <>
        <rect x="4" y="5.5" width="16" height="14" rx="3" />
        <path d="M8 3.5v4M16 3.5v4M4 10h16M9 14l2 2 4-4" />
      </>
    ),
    discover: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4 4M9 11l1.5-3 3 1.5-1.5 3z" />
      </>
    ),
    tools: (
      <>
        <rect x="4" y="4" width="7" height="7" rx="2" />
        <rect x="13" y="4" width="7" height="7" rx="2" />
        <rect x="4" y="13" width="7" height="7" rx="2" />
        <rect x="13" y="13" width="7" height="7" rx="2" />
      </>
    ),
    enquiries: (
      <>
        <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
        <path d="M4.5 7.5l7.5 5.5 7.5-5.5" />
      </>
    ),
    page: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M4 12h16M12 4c2.4 2.4 3.5 5 3.5 8s-1.1 5.6-3.5 8c-2.4-2.4-3.5-5-3.5-8s1.1-5.6 3.5-8z" />
      </>
    ),
    booking: (
      <>
        <path d="M4 8.5V6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v2a2.5 2.5 0 0 0 0 5v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 15.5v-2a2.5 2.5 0 0 0 0-5z" />
        <path d="M14 5v12" strokeDasharray="1.6 2" />
      </>
    ),
    payments: (
      <>
        <rect x="3.5" y="6" width="17" height="12" rx="3" />
        <path d="M3.5 10h17M7.5 14.5h3" />
      </>
    ),
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[k]}
    </svg>
  );
}

export function PlanRightsList({ kind, tint = "var(--text)" }: { kind: PlanKind; tint?: string }) {
  const rows = PLAN_RIGHTS[kind];
  const tinted = tint.startsWith("#");
  return (
    <div data-testid="plan-rights" style={{ marginTop: 12, borderTop: "1.5px solid var(--el)", paddingTop: 11 }}>
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase" }}>What you get</div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {rows.map(([k, t, s]) => (
          <li key={t} data-testid={`plan-right-${k}`} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span
              aria-hidden="true"
              style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: "grid", placeItems: "center", background: tinted ? `${tint}1c` : "var(--el)", border: `1.5px solid ${tinted ? `${tint}40` : "var(--el)"}` }}
            >
              <PlanIcon k={k} color={tint} />
            </span>
            <span style={{ minWidth: 0, paddingTop: 1 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: "var(--text)", lineHeight: 1.25 }}>{t}</span>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--sub)", lineHeight: 1.4, marginTop: 1 }}>{s}</span>
            </span>
          </li>
        ))}
      </ul>
      <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 10, lineHeight: 1.45 }}>{PLAN_RIGHTS_NOTE}</div>
    </div>
  );
}
