import { INK, SUB } from "@/lib/design/tokens";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

/** A DESK WHOSE MIGRATION HAS NOT BEEN PUSHED YET (11 Sep 2026).
 *
 *  The money and communication desks read through SECURITY DEFINER RPCs that
 *  arrive in `20260913110000_admin_money_and_communication.sql`. Before that
 *  migration is applied the functions do not exist, PostgREST answers 42883,
 *  and the honest thing to draw is this rather than a 500 — "you have not run
 *  the migration" and "the app is broken" look identical from a stack trace,
 *  and only one of them is true.
 *
 *  It disappears of its own accord the moment the migration lands; there is
 *  nothing to remove afterwards. */
export function DeskNeedsMigration({ what }: { what: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${EL}`, borderLeft: "4px solid #F59E0B", borderRadius: 14, padding: "11px 13px", margin: "0 0 12px" }}>
      <b style={{ fontSize: 12, color: INK }}>{what} is waiting on a migration</b>
      <div style={{ fontSize: 10.5, color: SUB, marginTop: 3, lineHeight: 1.55 }}>
        Everything on this screen is built and nothing is wrong — the database simply does not have the functions it reads
        yet, so the figures below are zeros. Apply it and this notice goes away:
      </div>
      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 7, fontFamily: "ui-monospace, monospace", background: "var(--bg)", borderRadius: 9, padding: "7px 9px", lineHeight: 1.5, overflowX: "auto" }}>
        powershell -NoProfile -ExecutionPolicy Bypass -File scripts/db-push.ps1
      </div>
    </div>
  );
}
