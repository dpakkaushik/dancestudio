import Link from "next/link";
import { DOS_DISPLAY, INK, SUB } from "@/lib/design/tokens";
import type { AdminDashboard as Pulse } from "@/repositories/adminPanel";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

const Head = ({ children }: { children: string }) => (
  <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED, margin: "18px 0 8px" }}>{children}</div>
);

const rupees = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `₹${n}`;

/** One figure, at the size of a figure. A door when there is somewhere to go. */
function Fig({ n, label, href, tone }: { n: string | number; label: string; href?: string; tone?: string }) {
  const body = (
    <>
      <span style={{ display: "block", fontSize: 21, fontWeight: 900, lineHeight: 1, letterSpacing: -0.6, fontFamily: DOS_DISPLAY, color: tone ?? INK, fontVariantNumeric: "tabular-nums" }}>{n}</span>
      <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: MUTED, marginTop: 4, lineHeight: 1.3 }}>{label}</span>
    </>
  );
  const style: React.CSSProperties = { background: CARD, border: `1px solid ${EL}`, borderRadius: 14, padding: "11px 12px", textDecoration: "none", display: "block", minWidth: 0 };
  return href ? <Link href={href} style={style}>{body}</Link> : <div style={style}>{body}</div>;
}

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>{children}</div>
);

/** THE OVERVIEW (10 Sep 2026): what is waiting on an admin first, because that
 *  is the only part of a dashboard that is work rather than reading. Then what
 *  the platform is, what moved in the last seven days, and what is stuck.
 *
 *  Every number is an aggregate from one SECURITY DEFINER call — the panel
 *  never reads a person's row to draw a count. */
export function AdminDashboardScreen({ pulse, nowIso }: { pulse: Pulse; nowIso: string }) {
  const w = pulse.waiting;
  const todo = w.verifications + w.threads + w.reports + w.pastDue + w.refunds + w.stuckWebhooks;
  const day = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" }).format(new Date(nowIso));

  return (
    <div style={{ padding: "14px 16px var(--dos-foot, 40px)" }}>
      <div style={{ borderRadius: 22, padding: "15px 17px 14px", marginBottom: 4, position: "relative", overflow: "hidden", color: "#fff", background: todo > 0 ? "linear-gradient(135deg,#B45309,#F59E0B)" : "linear-gradient(135deg,#166534,#22C55E)" }}>
        <div style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
        <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, opacity: 0.85, position: "relative" }}>DANCEOS · ADMIN</div>
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, position: "relative", fontFamily: DOS_DISPLAY, lineHeight: 1.18, marginTop: 2 }}>
          {todo > 0 ? `${todo} thing${todo === 1 ? "" : "s"} need you` : "Nothing is waiting"}
        </div>
        <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2, position: "relative" }}>{day}</div>
      </div>

      <Head>WAITING ON YOU</Head>
      <Grid>
        <Fig n={w.verifications} label="organizations to verify" href="/admin/verifications" tone={w.verifications > 0 ? "#F59E0B" : undefined} />
        <Fig n={w.threads} label="conversations to answer" href="/admin/support" tone={w.threads > 0 ? "#F59E0B" : undefined} />
        <Fig n={w.reports} label="reports to answer" href="/admin/reports" tone={w.reports > 0 ? "#EF4444" : undefined} />
        {/* a renewal the bank refused is work waiting: three days of grace, then the
            studio comes off Discover — the admin can see it coming (10 Sep 2026) */}
        <Fig n={w.pastDue} label="renewals failing" href="/admin/subscriptions?status=past_due" tone={w.pastDue > 0 ? "#EF4444" : undefined} />
        <Fig n={w.refunds} label="refunds in the queue" tone={w.refunds > 0 ? "#EF4444" : undefined} />
      </Grid>
      {w.stuckWebhooks > 0 ? (
        <div style={{ background: CARD, border: `1px solid ${EL}`, borderLeft: "4px solid #EF4444", borderRadius: 14, padding: "10px 12px", marginTop: 8 }}>
          <b style={{ fontSize: 12 }}>{w.stuckWebhooks} payment webhook{w.stuckWebhooks === 1 ? "" : "s"} never finished</b>
          <div style={{ fontSize: 10.5, color: SUB, marginTop: 2, lineHeight: 1.5 }}>
            A delivery arrived and its work did not complete. Money screens may be behind until it is replayed.
          </div>
        </div>
      ) : null}

      <Head>ACCOUNTS</Head>
      <Grid>
        <Fig n={pulse.accounts.users} label="users" href="/admin/accounts" />
        <Fig n={pulse.accounts.orgs} label="organizations" href="/admin/accounts" />
        <Fig n={pulse.accounts.artists} label="on the Artist plan" />
        <Fig n={pulse.accounts.verifiedOrgs} label="verified organizations" />
        <Fig n={pulse.accounts.newThisWeek} label="new this week" />
        <Fig n={pulse.accounts.suspended} label="suspended" tone={pulse.accounts.suspended > 0 ? "#EF4444" : undefined} href="/admin/accounts" />
      </Grid>

      <Head>WHAT EXISTS</Head>
      <Grid>
        <Fig n={pulse.businesses.studios} label="studios" href="/admin/businesses" />
        <Fig n={pulse.businesses.artistPages} label="artist pages" href="/admin/businesses" />
        <Fig n={pulse.businesses.rooms} label="rooms" />
        <Fig n={pulse.businesses.listed} label="public" tone="#22C55E" href="/admin/businesses" />
        <Fig n={pulse.businesses.unlisted} label="not public yet" tone={pulse.businesses.unlisted > 0 ? "#F59E0B" : undefined} href="/admin/businesses" />
        <Fig n={pulse.businesses.subscribedStudios} label="studios subscribed" href="/admin/subscriptions" />
      </Grid>

      <Head>SUBSCRIPTIONS</Head>
      <Grid>
        <Fig n={pulse.subscriptions.renewing} label="renewing on their own" href="/admin/subscriptions?status=active" tone="#22C55E" />
        <Fig n={pulse.subscriptions.granted} label="granted, free" href="/admin/subscriptions" />
        <Fig n={pulse.subscriptions.canceling} label="ending, not renewing" href="/admin/subscriptions?status=canceled" tone={pulse.subscriptions.canceling > 0 ? "#F59E0B" : undefined} />
        <Fig n={pulse.subscriptions.pastDue} label="past due" href="/admin/subscriptions?status=past_due" tone={pulse.subscriptions.pastDue > 0 ? "#EF4444" : undefined} />
        <Fig n={rupees(pulse.subscriptions.mrrInr)} label="a month, if every mandate holds" href="/admin/plans" />
        <Fig n={pulse.activity.crews} label="crews" />
      </Grid>

      <Head>THE LAST SEVEN DAYS</Head>
      <Grid>
        <Fig n={pulse.activity.bookingsWeek} label="class bookings" />
        <Fig n={pulse.activity.eventBookingsWeek} label="event bookings" />
        <Fig n={rupees(pulse.money.capturedWeekInr)} label="captured" />
        <Fig n={pulse.activity.classesLive} label="classes live" />
        <Fig n={pulse.activity.eventsLive} label="events live" />
        <Fig n={pulse.activity.enquiriesOpen} label="enquiries open" />
      </Grid>

      <Head>MONEY, ALL TIME</Head>
      <Grid>
        <Fig n={rupees(pulse.money.capturedAllInr)} label="captured, everything" />
        <Fig n={rupees(pulse.money.plansAllInr)} label="of it from plans — DanceOS's own" href="/admin/subscriptions" tone="#22C55E" />
        <Fig n={rupees(pulse.money.refundedAllInr)} label="refunded" />
      </Grid>
      {pulse.money.ordersUnpaid > 0 ? (
        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
          {pulse.money.ordersUnpaid} checkout{pulse.money.ordersUnpaid === 1 ? "" : "s"} started over an hour ago and never paid. Normal in small numbers — somebody closed the tab.
        </div>
      ) : null}

      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 18, lineHeight: 1.55, borderTop: `1px solid ${EL}`, paddingTop: 12 }}>
        Plan money has its own screen under Subscriptions; class money oversight (stuck orders, refund disputes) comes in a later phase. Every decision you make is recorded in{" "}
        <Link href="/admin/audit" style={{ color: INK, fontWeight: 800 }}>the audit log</Link>.
      </div>
    </div>
  );
}
