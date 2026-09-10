import Link from "next/link";
import { DOS_DISPLAY, INK, SUB } from "@/lib/design/tokens";
import type { AdminCommunication, AdminNotification } from "@/repositories/adminPanel";
import { agoWords } from "@/types/notification";
import { DeskNeedsMigration } from "./DeskNeedsMigration";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

const Head = ({ children }: { children: string }) => (
  <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED, margin: "18px 0 8px" }}>{children}</div>
);

function Fig({ n, label, tone, href }: { n: string | number; label: string; tone?: string; href?: string }) {
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

/** the six kinds a notification can be, in the words the app uses to a person */
const KIND_WORDS: Record<string, string> = {
  enquiry: "Enquiries",
  booking: "Bookings",
  money: "Money",
  people: "People",
  event: "Events",
  class: "Classes",
};
const KIND_TINT: Record<string, string> = {
  enquiry: "#7C3AED",
  booking: "#1D4ED8",
  money: "#22C55E",
  people: "#EC4899",
  event: "#F59E0B",
  class: "#0EA5E9",
};

const KINDS = ["all", "enquiry", "booking", "money", "people", "event", "class"] as const;

/** COMMUNICATION (11 Sep 2026) — the segment that answers "did the platform
 *  actually say anything, and did anybody read it?"
 *
 *  `notifications` is raised by triggers where the fact happens and read by one
 *  person at a time, so until now nobody could see it as a whole. That matters
 *  in two ordinary situations: a studio says nobody turned up (did the booking
 *  notification go out at all?), and a trigger gets changed (is it still saying
 *  the right thing to the right person?). The last words the platform said are
 *  printed here for exactly that reason.
 *
 *  THE SHARE THAT IS OPENED is the number worth watching. A kind nobody opens
 *  is not a channel, it is noise, and it is the first thing to cut when the
 *  volume grows. Outbound email and SMS are NOT here, because the app does not
 *  send any yet — auth mail is Supabase's, and nothing records a delivery. That
 *  gap is in the audit, not hidden behind a zero. */
export function CommunicationDesk({
  pulse,
  recent,
  kind,
  needsMigration,
  nowIso,
}: {
  pulse: AdminCommunication;
  recent: AdminNotification[];
  kind: string;
  needsMigration: boolean;
  nowIso: string;
}) {
  const waiting = pulse.support.waitingOnUs;

  return (
    <div style={{ padding: "14px 16px var(--dos-foot, 40px)" }}>
      <div style={{ borderRadius: 22, padding: "15px 17px 14px", marginBottom: 12, position: "relative", overflow: "hidden", color: "#fff", background: waiting > 0 ? "linear-gradient(135deg,#B45309,#F59E0B)" : "linear-gradient(135deg,#4C1D95,#7C3AED)" }}>
        <div style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
        <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, opacity: 0.85, position: "relative" }}>COMMUNICATION</div>
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, position: "relative", fontFamily: DOS_DISPLAY, lineHeight: 1.18, marginTop: 2 }}>
          {waiting > 0
            ? `${waiting} conversation${waiting === 1 ? "" : "s"} where the last word is theirs`
            : "Nobody is waiting on a reply"}
        </div>
        <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2, position: "relative" }}>
          {pulse.notifications.today} notification{pulse.notifications.today === 1 ? "" : "s"} raised today
        </div>
      </div>

      {needsMigration ? <DeskNeedsMigration what="The communication desk" /> : null}

      <Head>CONVERSATIONS — DANCEOS AND ONE ACCOUNT</Head>
      <Grid>
        <Fig n={pulse.support.waitingOnUs} label="waiting on a reply from us" href="/admin/support" tone={waiting > 0 ? "#F59E0B" : undefined} />
        <Fig n={pulse.support.oldestWaitingDays} label="days the oldest has waited" tone={pulse.support.oldestWaitingDays >= 3 ? "#EF4444" : undefined} />
        <Fig n={pulse.support.open} label="threads open" href="/admin/support" />
        <Fig n={pulse.support.messagesWeek} label="messages this week" />
        <Fig n={pulse.support.closed} label="threads closed" />
        <Fig n={pulse.enquiries.open} label="enquiries open, studio to dancer" />
      </Grid>

      <Head>WHAT THE PLATFORM SAID</Head>
      <Grid>
        <Fig n={pulse.notifications.today} label="raised today" />
        <Fig n={pulse.notifications.week} label="raised this week" />
        <Fig n={pulse.notifications.all} label="raised ever" />
        <Fig n={`${pulse.notifications.readPct}%`} label="opened, last 30 days" tone={pulse.notifications.readPct < 40 ? "#F59E0B" : "#22C55E"} />
        <Fig n={pulse.notifications.unread} label="never opened" />
        <Fig n={pulse.enquiries.week} label="enquiries this week" />
      </Grid>

      {pulse.notifications.byKind.length > 0 ? (
        <>
          <Head>BY KIND, LAST 30 DAYS</Head>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pulse.notifications.byKind
              .slice()
              .sort((a, b) => b.n - a.n)
              .map((k) => {
                const tint = KIND_TINT[k.kind] ?? "#64748B";
                /* the bar is the share opened, not the volume: a tall bar nobody
                   opens is the thing this screen exists to make obvious */
                return (
                  <div key={k.kind} style={{ background: CARD, border: `1px solid ${EL}`, borderRadius: 12, padding: "9px 11px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                      <b style={{ fontSize: 12, color: INK, flex: 1, minWidth: 0 }}>{KIND_WORDS[k.kind] ?? k.kind}</b>
                      <span style={{ fontSize: 11, fontWeight: 800, color: SUB, fontVariantNumeric: "tabular-nums" }}>{k.n}</span>
                      <span style={{ fontSize: 11, fontWeight: 900, color: k.readPct < 40 ? "#F59E0B" : "#22C55E", fontVariantNumeric: "tabular-nums", width: 38, textAlign: "right" }}>{k.readPct}%</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: "var(--el)", marginTop: 6, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, k.readPct))}%`, background: tint, borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
          </div>
          <div style={{ fontSize: 10.5, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
            The bar is the share that was opened, not how many were sent. A kind with a long list and a short bar is
            noise, and it is the first thing to cut.
          </div>
        </>
      ) : null}

      <Head>THE LAST THINGS IT SAID</Head>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", scrollbarWidth: "none" }}>
        {KINDS.map((k) => (
          <Link
            key={k}
            href={`/admin/communication${k === "all" ? "" : `?kind=${k}`}`}
            style={{ flex: "0 0 auto", padding: "6px 11px", borderRadius: 999, fontSize: 11, fontWeight: 800, textDecoration: "none", background: kind === k ? "var(--text)" : CARD, color: kind === k ? "var(--solid)" : SUB, border: `1px solid ${kind === k ? "var(--text)" : EL}`, whiteSpace: "nowrap" }}
          >
            {k === "all" ? "All" : KIND_WORDS[k] ?? k}
          </Link>
        ))}
      </div>

      {recent.length === 0 ? (
        <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.55 }}>Nothing has been said yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {recent.map((n) => {
            const tint = KIND_TINT[n.kind] ?? "#64748B";
            return (
              <div key={n.id} data-testid="admin-notification" style={{ background: CARD, border: `1px solid ${EL}`, borderLeft: `4px solid ${tint}`, borderRadius: 14, padding: "10px 12px", opacity: n.readAt ? 1 : 0.96 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                  <b style={{ fontSize: 12.5, color: INK }}>{n.title}</b>
                  <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 5, background: `${tint}22`, color: tint }}>{(KIND_WORDS[n.kind] ?? n.kind).toUpperCase()}</span>
                  {n.readAt ? null : <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 5, background: "var(--el)", color: SUB }}>NOT OPENED</span>}
                </div>
                {n.body ? <div style={{ fontSize: 11, color: SUB, marginTop: 3, lineHeight: 1.45 }}>{n.body}</div> : null}
                <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>
                  to {n.personName} · {agoWords(n.createdAt, nowIso)}
                  {n.href ? ` · opens ${n.href}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 18, lineHeight: 1.55, borderTop: `1px solid ${EL}`, paddingTop: 12 }}>
        Everything here is IN-APP. DanceOS sends no email or SMS of its own yet — the only mail is Supabase&apos;s
        sign-in mail — so there is no delivery to report and nothing is being hidden behind a zero. Answering a
        conversation happens on <Link href="/admin/support" style={{ color: INK, fontWeight: 800 }}>Support</Link>.
      </div>
    </div>
  );
}
