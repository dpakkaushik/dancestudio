import Link from "next/link";
import { DOS_DISPLAY, INK, SUB } from "@/lib/design/tokens";
import type { AdminDashboard as Pulse } from "@/repositories/adminPanel";
import { AdminGlyph, DESK_TINT } from "./admin-glyphs";
import { DeskHero } from "./desk-kit";

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

/** THE DASHBOARD, AS ITS OWN DESK (11 Sep 2026 — the user: "the marked portion
 *  should also be inside a block named Dashboard; the main screen will only
 *  have a designated block for every part of it").
 *
 *  These figures used to run down /admin underneath the desk blocks, which had
 *  it backwards: the front door was mostly reading material, and the blocks —
 *  the actual nav — were a header above it. They are a desk now, reached from
 *  its own block, and /admin is the map.
 *
 *  What is waiting comes first, because that is the only part of a dashboard
 *  that is WORK rather than reading. Then what the platform is, what moved in
 *  the last seven days, and what is stuck.
 *
 *  Every number is an aggregate from one SECURITY DEFINER call — the panel
 *  never reads a person's row to draw a count. */
export function AdminDashboardScreen({ pulse, nowIso }: { pulse: Pulse; nowIso: string }) {
  const w = pulse.waiting;
  const todo = w.verifications + w.threads + w.reports + w.pastDue + w.refunds + w.stuckWebhooks;
  const day = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" }).format(new Date(nowIso));

  return (
    <div style={{ padding: "6px 16px var(--dos-foot, 40px)" }}>
      <DeskHero
        eyebrow="DANCEOS · ADMIN"
        title={todo > 0 ? `${todo} thing${todo === 1 ? "" : "s"} need you` : "Nothing is waiting"}
        sub={day}
        tint={todo > 0 ? DESK_TINT.dashboard : "#22C55E"}
        icon={<AdminGlyph k="dashboard" size={22} />}
      />

      <Head>WAITING ON YOU</Head>
      <Grid>
        <Fig n={w.verifications} label="organizations to verify" href="/admin/verifications" tone={w.verifications > 0 ? "#F59E0B" : undefined} />
        <Fig n={w.threads} label="conversations to answer" href="/admin/support" tone={w.threads > 0 ? "#F59E0B" : undefined} />
        <Fig n={w.reports} label="reports to answer" href="/admin/reports" tone={w.reports > 0 ? "#EF4444" : undefined} />
        {/* a renewal the bank refused is work waiting: three days of grace, then the
            studio comes off Discover — the admin can see it coming (10 Sep 2026) */}
        <Fig n={w.pastDue} label="renewals failing" href="/admin/subscriptions?status=past_due" tone={w.pastDue > 0 ? "#EF4444" : undefined} />
        {/* a door at last (11 Sep 2026): the money desk shows who has been waiting,
            and for how many days, which is the number that says which one to chase */}
        <Fig n={w.refunds} label="refunds in the queue" href="/admin/payments?tab=refunds" tone={w.refunds > 0 ? "#EF4444" : undefined} />
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
        <Fig n={pulse.accounts.users} label="users" href="/admin/accounts?tab=users" />
        <Fig n={pulse.accounts.orgs} label="organizations" href="/admin/accounts?tab=orgs" />
        <Fig n={pulse.accounts.artists} label="on the Artist plan" />
        <Fig n={pulse.accounts.verifiedOrgs} label="verified organizations" href="/admin/verifications?tab=approved" />
        <Fig n={pulse.accounts.newThisWeek} label="new this week" />
        <Fig n={pulse.accounts.suspended} label="suspended" tone={pulse.accounts.suspended > 0 ? "#EF4444" : undefined} href="/admin/accounts?tab=suspended" />
      </Grid>

      <Head>WHAT EXISTS</Head>
      <Grid>
        <Fig n={pulse.businesses.studios} label="studios" href="/admin/businesses?tab=studios" />
        <Fig n={pulse.businesses.artistPages} label="artist pages" href="/admin/businesses?tab=artists" />
        <Fig n={pulse.businesses.rooms} label="rooms" />
        <Fig n={pulse.businesses.listed} label="public" tone="#22C55E" href="/admin/businesses?tab=public" />
        <Fig n={pulse.businesses.unlisted} label="not public yet" tone={pulse.businesses.unlisted > 0 ? "#F59E0B" : undefined} href="/admin/businesses?tab=private" />
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
        <Fig n={rupees(pulse.money.capturedWeekInr)} label="captured" href="/admin/payments" />
        <Fig n={pulse.activity.classesLive} label="classes live" />
        <Fig n={pulse.activity.eventsLive} label="events live" />
        <Fig n={pulse.activity.enquiriesOpen} label="enquiries open" />
      </Grid>

      <Head>MONEY, ALL TIME</Head>
      <Grid>
        <Fig n={rupees(pulse.money.capturedAllInr)} label="captured, everything" href="/admin/payments" />
        <Fig n={rupees(pulse.money.plansAllInr)} label="of it from plans — DanceOS's own" href="/admin/subscriptions" tone="#22C55E" />
        <Fig n={rupees(pulse.money.refundedAllInr)} label="refunded" href="/admin/payments?tab=refunds" />
      </Grid>
      {pulse.money.ordersUnpaid > 0 ? (
        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
          {pulse.money.ordersUnpaid} checkout{pulse.money.ordersUnpaid === 1 ? "" : "s"} started over an hour ago and never paid. Normal in small numbers — somebody closed the tab.
        </div>
      ) : null}

      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 18, lineHeight: 1.55, borderTop: `1px solid ${EL}`, paddingTop: 12 }}>
        Every figure here is a door where there is somewhere to go. Every payment, refund and payout has a screen of its
        own on <Link href="/admin/payments" style={{ color: INK, fontWeight: 800 }}>Money</Link> — read-only, because
        settling a refund belongs to the studio whose class it was. Every decision you make is recorded in{" "}
        <Link href="/admin/audit" style={{ color: INK, fontWeight: 800 }}>the audit log</Link>.
      </div>
    </div>
  );
}
