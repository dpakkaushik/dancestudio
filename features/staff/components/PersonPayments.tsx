import Link from "next/link";

import { DeskHero } from "@/features/businesses/components/biz-kit";
import { PayHistoryExport } from "./PayHistoryExport";
import { DOS_DISPLAY, DOS_UI, GREEN, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import { PAYOUT_METHOD_LABEL, payoutTone, type PersonPayHistory } from "@/types/payout";

/** EVERY TRANSACTION WITH ONE PERSON (29 Sep 2026, the user: "Team payment
 *  history to be a button called History which should show all transactions
 *  with that particular person on a different page").
 *
 *  ⚠ WHAT THIS REPLACED WAS A LIST OF SIX. The member sheet drew
 *  `paidTo(user).slice(0, 6)` under a heading that counted ALL of them, so a
 *  studio paying somebody monthly read "₹90,000 paid · 12 payments" over six
 *  rows and had no way to reach the rest. A sheet is the wrong shape for a
 *  ledger — it is 82vh of a phone with a form under it — which is why the
 *  user asked for a page.
 *
 *  ⚠ AND IT SAYS WHICH SESSIONS EACH PAYMENT COVERED. The desk's row has only
 *  a count ("3 sessions"), which on a page about one person is precisely the
 *  number you then go looking for the detail of. A payment recorded through
 *  `record_team_payment` (19 Sep 2026, R35) carries NO lines by design — it is
 *  a salary, not a bill for sessions — so it says that rather than showing an
 *  empty list. */

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/* the same date grammar the ledger prints — a payout's `paid_on` is a DATE */
const dayWords = (iso: string): string => {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
};

const sessionWhen = (iso: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
};

const TONE: Record<"done" | "transit" | "held", { word: string; ink: string; ground: string }> = {
  done: { word: "PAID", ink: GREEN, ground: "rgba(34,197,94,.16)" },
  transit: { word: "IN TRANSIT", ink: "#F59E0B", ground: "rgba(245,158,11,.16)" },
  held: { word: "ON HOLD", ink: "#F87171", ground: "rgba(248,113,113,.16)" },
};

export function PersonPayments({
  businessId,
  businessName,
  personName,
  avatarPath,
  history,
}: {
  businessId: string;
  businessName: string;
  personName: string;
  avatarPath: string | null;
  history: PersonPayHistory;
}) {
  const face = photoUrl(avatarPath);
  const initials = personName
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div style={{ background: "var(--bg)", minHeight: "100%", color: "var(--text)", fontFamily: DOS_UI, paddingBottom: 40 }}>
      <div style={{ maxWidth: 430, margin: "0 auto", padding: "0 16px" }}>
        {/* the tool's own hero, with the business named under it — this page is
            the Team desk's, so it wears Team's colour and says whose team, the
            same two elements in the same order the desk itself draws (C49) */}
        <DeskHero tool="team" as="h1" margin="12px 0 8px" />
        <div style={{ fontSize: 11.5, color: SUB, fontWeight: 800, margin: "0 0 12px" }}>{businessName}</div>

        {/* WHO — the page is about one person, so it leads with them */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, margin: "14px 0 12px" }}>
          {face ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={face} alt="" width={44} height={44} style={{ width: 44, height: 44, borderRadius: 13, objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <span style={{ width: 44, height: 44, borderRadius: 13, background: "var(--el)", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 900, flexShrink: 0 }}>
              {initials}
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: DOS_DISPLAY, letterSpacing: -0.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {personName}
            </div>
            <div style={{ fontSize: 10.5, color: SUB, marginTop: 2 }}>
              Everything {businessName} has paid them
            </div>
          </div>
        </div>

        {/* THE THREE FIGURES — settled, not-yet, and how many sessions it covered */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[
            { k: "Settled", v: rupees(history.paidInr) },
            { k: "Not landed yet", v: rupees(history.pendingInr) },
            { k: "Sessions paid", v: String(history.sessionsPaid) },
          ].map((f) => (
            <div key={f.k} style={{ flex: 1, minWidth: 0, background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 14, padding: "10px 11px" }}>
              <div style={{ fontSize: 15, fontWeight: 900, fontFamily: DOS_DISPLAY, letterSpacing: -0.4, overflow: "hidden", textOverflow: "ellipsis" }}>{f.v}</div>
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--muted)", marginTop: 3 }}>{f.k}</div>
            </div>
          ))}
        </div>

        {/* ⚠ A CAPPED READ SAYS SO — the rule both earnings halves have followed
            since 21 Sep 2026: a total that may be short must not look finished */}
        {!history.complete ? (
          <div style={{ fontSize: 10.5, color: "#F59E0B", marginBottom: 10, lineHeight: 1.45 }}>
            Counting the latest 4,000 rows only — the figures above may be short.
          </div>
        ) : null}

        <div style={{ display: "flex", alignItems: "baseline", gap: 7, margin: "4px 0 8px" }}>
          <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.1, color: "var(--muted)" }}>PAYMENTS</span>
          <span style={{ fontSize: 10.5, color: SUB }}>
            {history.payouts.length === 0
              ? "nothing yet"
              : `${history.payouts.length} ${history.payouts.length === 1 ? "payment" : "payments"}`}
          </span>
        </div>

        {history.payouts.length === 0 ? (
          <div style={{ background: "var(--card)", border: "1.5px dashed var(--el)", borderRadius: 16, padding: "22px 16px", textAlign: "center", fontSize: 12, color: SUB, lineHeight: 1.5 }}>
            Nothing paid to {personName} yet.
            <br />
            Record one from their row on the Team desk.
          </div>
        ) : null}

        {history.payouts.map((p) => {
          const tone = TONE[payoutTone(p.status)];
          return (
            <div key={p.id} style={{ background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 900, fontFamily: DOS_DISPLAY, letterSpacing: -0.4 }}>{rupees(p.amountInr)}</span>
                <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 9, fontWeight: 900, padding: "3px 8px", borderRadius: 999, background: tone.ground, color: tone.ink }}>
                  {tone.word}
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: SUB, marginTop: 4 }}>
                {dayWords(p.paidOn)} · {PAYOUT_METHOD_LABEL[p.method]}
                {p.providerRef ? ` · ref ${p.providerRef}` : ""}
              </div>
              {p.note ? <div style={{ fontSize: 11, marginTop: 6 }}>{p.note}</div> : null}

              {/* WHAT IT COVERED — the half the desk's row only counts */}
              {p.sessions.length > 0 ? (
                <div style={{ marginTop: 9, paddingTop: 9, borderTop: "1.5px solid var(--el)" }}>
                  <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)", marginBottom: 5 }}>
                    {p.sessions.length} {p.sessions.length === 1 ? "SESSION" : "SESSIONS"}
                  </div>
                  {p.sessions.map((s) => (
                    <div key={s.sessionId} style={{ display: "flex", gap: 10, padding: "3px 0", fontSize: 11 }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.classTitle}
                        <span style={{ color: SUB }}>{s.startsAt ? ` · ${sessionWhen(s.startsAt)}` : ""}</span>
                      </span>
                      <b style={{ flexShrink: 0 }}>{rupees(s.rateInr)}</b>
                    </div>
                  ))}
                </div>
              ) : (
                /* ⚠ NOT AN EMPTY LIST — `record_team_payment` writes a payout
                   with no session lines ON PURPOSE (19 Sep 2026, R35): it is what
                   a front-desk seat is paid, and `record_payout` refuses anything
                   that is not a bill for sessions. Saying so is the difference
                   between "nothing here" and "this kind has nothing here". */
                <div style={{ fontSize: 10.5, color: SUB, marginTop: 7 }}>Not against sessions — recorded as an amount.</div>
              )}
            </div>
          );
        })}

        {/* ⚠ A LEDGER YOU CANNOT GET OUT OF IS HALF A LEDGER. The Invoices
            screen and the month statements have had a real CSV since 29 Aug and
            this page had none — a studio reconciling a year of somebody's pay
            was reading twelve cards on a phone. One line per SESSION, because
            this is the only screen that knows which. */}
        <PayHistoryExport personName={personName} businessName={businessName} payouts={history.payouts} />

        <Link
          href={`/business/${businessId}/staff`}
          style={{ display: "block", marginTop: 14, textAlign: "center", padding: "12px", borderRadius: 999, background: "var(--card)", border: "1.5px solid var(--el)", fontWeight: 800, fontSize: 12.5, color: "var(--text)", textDecoration: "none" }}
        >
          Back to the team
        </Link>
      </div>
    </div>
  );
}
