import Link from "next/link";
import { DOS_DISPLAY, INK, SUB } from "@/lib/design/tokens";
import type { AdminDashboard as Pulse } from "@/repositories/adminPanel";
import { AdminGlyph, DESK_TINT } from "./admin-glyphs";
import { DESKS, type AdminBadges, type AdminDesk } from "./desks";

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

/** ONE DESK, AS A BLOCK (11 Sep 2026 — the user's ask: "boxes, block type views
 *  and an image/icon for each block"). This IS the panel's nav now: the icon in
 *  the desk's own colour, the name, what it is for in a line, and the number
 *  waiting on it. The same object Home draws for a studio's tools, so an admin
 *  who has used the app recognises it. */
function DeskBlock({ desk, waiting }: { desk: AdminDesk; waiting: number }) {
  const tint = DESK_TINT[desk.k];
  return (
    <Link
      href={desk.href}
      aria-label={`${desk.label}${waiting > 0 ? ` — ${waiting} waiting` : ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 9,
        background: CARD,
        border: `1px solid ${EL}`,
        borderRadius: 18,
        padding: "12px 12px 11px",
        textDecoration: "none",
        minWidth: 0,
        boxShadow: waiting > 0 ? `0 4px 16px ${tint}22` : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span style={{ width: 40, height: 40, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", background: `${tint}1c`, border: `1.5px solid ${tint}66`, color: tint, flexShrink: 0 }}>
          <AdminGlyph k={desk.k} size={21} />
        </span>
        {waiting > 0 ? (
          <span style={{ minWidth: 22, height: 22, borderRadius: 11, padding: "0 7px", background: desk.tone ?? tint, color: "#fff", fontSize: 11, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>
            {waiting > 99 ? "99+" : waiting}
          </span>
        ) : null}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 900, color: INK, fontFamily: DOS_DISPLAY, letterSpacing: -0.2, lineHeight: 1.15 }}>{desk.label}</div>
        <div style={{ fontSize: 10.5, color: SUB, marginTop: 3, lineHeight: 1.4 }}>{desk.what}</div>
      </div>
    </Link>
  );
}

/** THE OVERVIEW (10 Sep 2026): what is waiting on an admin first, because that
 *  is the only part of a dashboard that is work rather than reading. Then what
 *  the platform is, what moved in the last seven days, and what is stuck.
 *
 *  Every number is an aggregate from one SECURITY DEFINER call — the panel
 *  never reads a person's row to draw a count. */
export function AdminDashboardScreen({ pulse, badges = {}, nowIso }: { pulse: Pulse; badges?: AdminBadges; nowIso: string }) {
  const w = pulse.waiting;
  const todo = w.verifications + w.threads + w.reports + w.pastDue + w.refunds + w.stuckWebhooks;
  const day = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" }).format(new Date(nowIso));
  /* what each block wears: the nav's own badge where it has one, the pulse
     where the pulse knows better (refunds come from the dashboard RPC) */
  const waitingFor = (d: AdminDesk): number => {
    if (d.badge === "refunds") return Math.max(badges.refunds ?? 0, w.refunds);
    if (d.badge === "verifications") return Math.max(badges.verifications ?? 0, w.verifications);
    if (d.badge === "reports") return Math.max(badges.reports ?? 0, w.reports);
    if (d.badge === "money") return Math.max(badges.money ?? 0, w.pastDue);
    if (d.badge === "support") return badges.support ?? w.threads;
    return 0;
  };

  return (
    <div style={{ padding: "14px 16px var(--dos-foot, 40px)" }}>
      <div style={{ borderRadius: 22, padding: "15px 17px 14px", marginBottom: 4, position: "relative", overflow: "hidden", color: "#fff", background: todo > 0 ? "linear-gradient(135deg,#B45309,#F59E0B)" : "linear-gradient(135deg,#166534,#22C55E)" }}>
        <div style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
          <span style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 14, background: "rgba(0,0,0,.28)", border: "1.5px solid rgba(255,255,255,.35)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
            <AdminGlyph k="overview" size={22} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, opacity: 0.85 }}>DANCEOS · ADMIN</div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, fontFamily: DOS_DISPLAY, lineHeight: 1.18, marginTop: 2 }}>
              {todo > 0 ? `${todo} thing${todo === 1 ? "" : "s"} need you` : "Nothing is waiting"}
            </div>
            <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>{day}</div>
          </div>
        </div>
      </div>

      {/* ── THE PANEL, AS BLOCKS (11 Sep 2026). This is the nav. The user asked
          for "boxes, block type views and an image/icon for each block", in
          place of a row of pills that scrolled off the side of a phone — so
          every desk is here, first, with its icon, its purpose in a line and
          the number waiting on it. Each opens its own page. ── */}
      <Head>THE DESKS</Head>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {DESKS.map((d) => (
          <DeskBlock key={d.href} desk={d} waiting={waitingFor(d)} />
        ))}
      </div>

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
        Every payment, refund and payout now has a screen of its own on{" "}
        <Link href="/admin/payments" style={{ color: INK, fontWeight: 800 }}>Money</Link> — read-only, because settling a
        refund belongs to the studio whose class it was. Every decision you make is recorded in{" "}
        <Link href="/admin/audit" style={{ color: INK, fontWeight: 800 }}>the audit log</Link>.
      </div>
    </div>
  );
}
