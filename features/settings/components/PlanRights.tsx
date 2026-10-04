import { PLAN_RIGHTS, PLAN_RIGHTS_NOTE, type PlanKind } from "@/features/settings/planRights";

/** WHAT THIS SUBSCRIPTION BUYS — one card, three kinds (27 Sep 2026).
 *
 *  Drawn on the artist's own `/subscription`, and on a studio's and an
 *  organization's `/business/{id}/subscription`, which had a price and no list
 *  at all. Extracted rather than written twice: this repo's own recurring bill
 *  is the second copy (`linkChip` declared twice, the figure row written out
 *  three times), and a list of RIGHTS that drifts between two screens is worse
 *  than a style that does — one of them starts promising something. */
/** THE SAME RIGHTS, INSIDE A CARD (4 Oct 2026, the user: "should also show what
 *  all you get in the artist subscription") — one line each, icon and title, on
 *  the subscription card itself, so what you pay and what it buys are read
 *  together. Same `PLAN_RIGHTS` rows, so the two cannot drift. */
export function PlanRightsList({ kind }: { kind: PlanKind }) {
  const rows = PLAN_RIGHTS[kind];
  return (
    <div data-testid="plan-rights" style={{ marginTop: 12 }}>
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>What you get</div>
      <div style={{ display: "grid", gap: 7 }}>
        {rows.map(([ic, t]) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
            <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 8, background: "var(--el)", display: "grid", placeItems: "center", fontSize: 14, flexShrink: 0 }}>
              {ic}
            </span>
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlanRights({ kind }: { kind: PlanKind }) {
  const rows = PLAN_RIGHTS[kind];
  return (
    <div style={{ background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>What it buys</div>
      {rows.map(([ic, t, s], i) => (
        <div key={t} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", borderBottom: i === rows.length - 1 ? "none" : "1.5px solid var(--el)" }}>
          <span aria-hidden="true" style={{ fontSize: 17, flexShrink: 0 }}>{ic}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>{t}</div>
            <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1, lineHeight: 1.4 }}>{s}</div>
          </div>
        </div>
      ))}
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 9, lineHeight: 1.45 }}>{PLAN_RIGHTS_NOTE}</div>
    </div>
  );
}
