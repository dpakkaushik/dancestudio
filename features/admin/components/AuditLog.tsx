import Link from "next/link";
import { DOS_DISPLAY, SUB } from "@/lib/design/tokens";
import type { AuditEntry } from "@/repositories/adminPanel";
import { agoWords } from "@/types/notification";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

/** Every action reads as a sentence, so the log can be skimmed rather than
 *  decoded. The tone is the weight of the act. */
const ACTIONS: Record<string, { says: string; tone: string }> = {
  "org.approve": { says: "verified", tone: "#22C55E" },
  "org.reject": { says: "did not approve", tone: "#EF4444" },
  "account.suspend": { says: "suspended", tone: "#EF4444" },
  "account.unsuspend": { says: "lifted the suspension on", tone: "#22C55E" },
  "support.open": { says: "wrote to", tone: "#0EA5E9" },
  "support.closed": { says: "closed the conversation with", tone: MUTED },
  "support.open_again": { says: "reopened the conversation with", tone: "#0EA5E9" },
  "business.unlist": { says: "took off Discover", tone: "#EF4444" },
  "business.list": { says: "put back on Discover", tone: "#22C55E" },
  "report.actioned": { says: "acted on a report about", tone: "#EF4444" },
  "report.dismissed": { says: "found no problem with", tone: MUTED },
  "subscription.grant": { says: "granted a subscription to", tone: "#22C55E" },
  "subscription.end": { says: "ended the subscription of", tone: "#EF4444" },
  "plan.grant": { says: "granted the Artist plan to", tone: "#22C55E" },
  "plan.end": { says: "ended the Artist plan of", tone: "#EF4444" },
  "plan.price": { says: "changed the price of", tone: "#F59E0B" },
};

/** THE AUDIT LOG (10 Sep 2026). Insert-only in the database, and a trigger
 *  refuses an UPDATE or DELETE from anybody at all — the service role and an
 *  admin included. That is the point: a log an admin can tidy is not evidence
 *  of anything. A correction is a new row.
 *
 *  Each line names the admin who acted, what they did, to whom, why, and when.
 *  The subject's name is a snapshot taken at the time, so the log still reads
 *  after the account it names has been deleted. */
export function AuditLog({ entries, nowIso, filter }: { entries: AuditEntry[]; nowIso: string; filter: string | null }) {
  const kinds = [...new Set(entries.map((e) => e.action))].sort();
  return (
    <div style={{ padding: "14px 16px var(--dos-foot, 40px)" }}>
      <div style={{ borderRadius: 22, padding: "15px 17px 14px", marginBottom: 14, position: "relative", overflow: "hidden", color: "#fff", background: "linear-gradient(135deg,#334155,#64748B)" }}>
        <div style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, position: "relative", fontFamily: DOS_DISPLAY, lineHeight: 1.18 }}>Audit log</div>
        <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2, position: "relative" }}>
          {entries.length === 0 ? "no decisions recorded yet" : `${entries.length} decision${entries.length === 1 ? "" : "s"}, newest first`}
        </div>
      </div>

      {kinds.length > 1 || filter ? (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", marginBottom: 12 }}>
          <Link href="/admin/audit" style={{ flex: "0 0 auto", padding: "6px 11px", borderRadius: 999, fontSize: 11, fontWeight: 800, textDecoration: "none", background: filter ? CARD : "var(--text)", color: filter ? SUB : "var(--solid)", border: `1px solid ${filter ? EL : "var(--text)"}` }}>
            Everything
          </Link>
          {kinds.map((k) => (
            <Link key={k} href={`/admin/audit?action=${encodeURIComponent(k)}`} style={{ flex: "0 0 auto", padding: "6px 11px", borderRadius: 999, fontSize: 11, fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap", background: filter === k ? "var(--text)" : CARD, color: filter === k ? "var(--solid)" : SUB, border: `1px solid ${filter === k ? "var(--text)" : EL}` }}>
              {k}
            </Link>
          ))}
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.55, padding: "0 2px" }}>
          Nothing yet. Approving or rejecting an organization, setting up or ending a subscription, suspending an
          account, taking a business off Discover, answering a report, and opening or closing a support conversation
          each write one line here, permanently.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((e) => {
            const a = ACTIONS[e.action] ?? { says: e.action, tone: MUTED };
            const who = e.actorEmail ?? "an admin";
            return (
              <div key={e.id} data-testid="audit-entry" style={{ background: CARD, border: `1px solid ${EL}`, borderLeft: `4px solid ${a.tone}`, borderRadius: 14, padding: "10px 12px" }}>
                <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                  <b>{who}</b> <span style={{ color: a.tone, fontWeight: 800 }}>{a.says}</span>{" "}
                  <b>{e.subjectLabel || "an account"}</b>
                </div>
                {e.reason ? (
                  <div style={{ fontSize: 11, color: SUB, marginTop: 4, lineHeight: 1.5, borderLeft: `2px solid ${EL}`, paddingLeft: 8 }}>{e.reason}</div>
                ) : null}
                <div style={{ fontSize: 10, color: MUTED, marginTop: 5, fontVariantNumeric: "tabular-nums" }}>
                  {agoWords(e.createdAt, nowIso)} · {e.action} · {e.subjectKind}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 16, lineHeight: 1.55, borderTop: `1px solid ${EL}`, paddingTop: 12 }}>
        This log cannot be edited or deleted by anybody, including you and the service role. A database trigger refuses
        both. The newest 100 decisions are shown.
      </div>
    </div>
  );
}
