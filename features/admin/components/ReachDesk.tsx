import Link from "next/link";
import { DOS_DISPLAY, INK, SUB } from "@/lib/design/tokens";
import type { ImpressionSurface } from "@/repositories/analytics";
import type {
  AdminBusiness,
  EmailEventRow,
  EmailPulseRow,
  ImpressionRow,
  SearchTermRow,
} from "@/repositories/adminPanel";
import { AdminGlyph } from "./admin-glyphs";
import { DeskHero, DeskTabs, SearchBar, CountLine, EmptyLine } from "./desk-kit";
import { DeskNeedsMigration } from "./DeskNeedsMigration";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";
const MONO = "ui-monospace, monospace";
/** ⚠ MEASURED AGAINST THE ADMIN GRID, NOT PICKED (R20's test is per-grid). The
 *  obvious teal is 2 DEGREES of hue from Businesses; this is 33 from its nearest
 *  saturated neighbour and carries 6.32:1 against the hero's white text, which
 *  is the best of the twelve. */
const TINT = "#A21CAF";

export type ReachTab = "searches" | "shown" | "email";

const Head = ({ children }: { children: string }) => (
  <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED, margin: "18px 0 8px" }}>{children}</div>
);

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: CARD, border: `1.5px solid ${EL}`, borderRadius: 14, padding: "10px 12px", marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>{children}</div>
);

function Fig({ n, label, tone }: { n: string | number; label: string; tone?: string }) {
  return (
    <div style={{ background: CARD, border: `1.5px solid ${EL}`, borderRadius: 14, padding: "11px 12px", minWidth: 0 }}>
      <span style={{ display: "block", fontSize: 21, fontWeight: 900, lineHeight: 1, letterSpacing: -0.6, fontFamily: DOS_DISPLAY, color: tone ?? INK, fontVariantNumeric: "tabular-nums" }}>{n}</span>
      <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: MUTED, marginTop: 4, lineHeight: 1.3 }}>{label}</span>
    </div>
  );
}

const Grid = ({ children, cols = 3 }: { children: React.ReactNode; cols?: number }) => (
  <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 8, marginBottom: 12 }}>{children}</div>
);

/** the windows offered, as links — the desk's state is its address */
const WINDOWS = [7, 30, 90];

function DayPicker({ base, tab, q, days }: { base: string; tab: ReachTab; q: string; days: number }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
      {WINDOWS.map((d) => {
        const on = d === days;
        const p = new URLSearchParams();
        p.set("tab", tab);
        if (q) p.set("q", q);
        if (d !== 30) p.set("days", String(d));
        return (
          <Link
            key={d}
            href={`${base}?${p.toString()}`}
            aria-current={on ? "true" : undefined}
            style={{ flex: 1, textAlign: "center", padding: "7px 4px", borderRadius: 11, textDecoration: "none", fontSize: 11.5, fontWeight: 800, background: on ? "var(--text)" : CARD, color: on ? "var(--solid)" : SUB, border: `1.5px solid ${on ? "var(--text)" : EL}` }}
          >
            {d} days
          </Link>
        );
      })}
    </div>
  );
}

/** THE SURFACES, IN WORDS RATHER THAN KEYS.
 *
 *  ⚠ `satisfies Record<ImpressionSurface, string>` ON PURPOSE (the 27 Sep 2026
 *  `GLYPH` lesson): a fifth surface added to the writer's union now FAILS TO
 *  COMPILE here rather than drawing its raw key on this desk, which is how a
 *  `Record<string, …>` let two Home tiles draw an empty chip for a fortnight.
 *  The fallback below is for a value already in the table under an older
 *  spelling, not for a surface nobody named. */
const SURFACE_WORDS = {
  discover: "Discover",
  search: "Search results",
  followed: "Followed by you",
  nearby: "Near me",
} satisfies Record<ImpressionSurface, string>;

const surfaceWord = (s: string): string => (s in SURFACE_WORDS ? SURFACE_WORDS[s as ImpressionSurface] : s);

const EVENT_TONE: Record<string, string> = {
  delivered: "#22C55E",
  opened: "#0EA5E9",
  clicked: "#0EA5E9",
  bounced: "#EF4444",
  complained: "#EF4444",
  "delivery_delayed": "#F59E0B",
};

const when = (iso: string): string => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
};

/** REACH (30 Sep 2026) — the desk over the three tables that had writers and no
 *  reader.
 *
 *  ⚠⚠ WHY IT IS NOT PART OF COMMUNICATION. That desk answers *what did DanceOS
 *  say, and did anybody read it* — `notifications`, raised by triggers. This one
 *  answers three questions nothing could answer at all: what people LOOKED FOR
 *  and did not find, what a business was SHOWN for, and whether the mail
 *  actually ARRIVED. Communication's own comment says outbound mail "is not
 *  here, because the app does not send any yet"; the third tab is where that
 *  gap is now answered rather than left in the audit.
 *
 *  ⚠ EVERY READ IS A DEFINER FUNCTION GATED ON `is_platform_admin()`, so there
 *  is no direct table access anywhere in here — `search_events`, `impressions`
 *  and `email_events` have RLS on and NOT ONE POLICY, which is the whole of
 *  their security. That also means the desk can only ask the four questions
 *  those functions were written to answer; there is deliberately no "total
 *  searches" figure, because nothing exposes one and inventing it would mean
 *  opening the table. */
export function ReachDesk({
  tab,
  q,
  days,
  terms,
  businesses,
  chosen,
  impressions,
  pulse,
  history,
  needsMigration,
  webhookConfigured,
}: {
  tab: ReachTab;
  q: string;
  days: number;
  terms: SearchTermRow[];
  businesses: AdminBusiness[];
  chosen: AdminBusiness | null;
  impressions: ImpressionRow[];
  pulse: EmailPulseRow[];
  history: EmailEventRow[];
  needsMigration: boolean;
  webhookConfigured: boolean;
}) {
  const base = "/admin/reach";
  const keep = { tab, days: days === 30 ? undefined : String(days) };
  const missed = terms.reduce((n, t) => n + t.searches, 0);
  const delivered = pulse.find((p) => p.eventType === "delivered")?.n ?? 0;
  const bounced = pulse.filter((p) => p.eventType === "bounced" || p.eventType === "complained").reduce((n, p) => n + p.n, 0);
  const totalMail = pulse.reduce((n, p) => n + p.n, 0);

  return (
    <div>
      <DeskHero
        eyebrow="DANCEOS ADMIN"
        title="Reach"
        sub="What people looked for, what they were shown, and what arrived"
        tint={TINT}
        icon={<AdminGlyph k="reach" size={22} />}
      />

      {needsMigration ? <DeskNeedsMigration what="Reach" /> : null}

      <DeskTabs
        base={base}
        current={tab}
        tabs={[
          { key: "searches", label: "Searches", count: terms.length },
          { key: "shown", label: "Shown", count: impressions.length || undefined },
          { key: "email", label: "Email", count: totalMail || undefined },
        ]}
        keep={{ days: days === 30 ? undefined : String(days) }}
      />

      {/* ── SEARCHES THAT FOUND NOTHING ──────────────────────────────────── */}
      {tab === "searches" ? (
        <>
          <DayPicker base={base} tab={tab} q="" days={days} />
          <Grid cols={2}>
            <Fig n={terms.length} label="terms with no answer" tone={terms.length ? "#F59E0B" : undefined} />
            <Fig n={missed} label="searches that found nothing" tone={missed ? "#F59E0B" : undefined} />
          </Grid>
          <Head>WHAT PEOPLE LOOKED FOR AND DID NOT FIND</Head>
          {terms.length === 0 ? (
            <EmptyLine>
              Nothing in the last {days} days. Every search DanceOS was asked in that window answered with
              something — which is either good news or a quiet month, and the figure above is the one to
              watch as traffic grows.
            </EmptyLine>
          ) : (
            <>
              <CountLine shown={terms.length} total={terms.length} what="terms" />
              {terms.map((t) => (
                <Row key={t.term}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.term}</span>
                  <span style={{ fontSize: 10, color: MUTED, flexShrink: 0 }}>{when(t.lastAt)}</span>
                  <span style={{ fontSize: 13, fontWeight: 900, fontVariantNumeric: "tabular-nums", flexShrink: 0, minWidth: 28, textAlign: "right" }}>{t.searches}</span>
                </Row>
              ))}
              <EmptyLine>
                Every row is one of two things: a studio that should be on DanceOS, or a word the search box
                does not understand. That is the whole reason this table exists.
              </EmptyLine>
            </>
          )}
        </>
      ) : null}

      {/* ── WHAT A BUSINESS WAS SHOWN FOR ────────────────────────────────── */}
      {tab === "shown" ? (
        <>
          <DayPicker base={base} tab={tab} q={q} days={days} />
          <SearchBar action={base} q={q} placeholder="Find a studio or an artist" keep={keep} />
          {!q ? (
            <EmptyLine>
              Find a business to see how often it was shown, on which surface, and where in the shelf.
              ⚠ An impression is one row per SHELF rather than per card, so “shown” counts the times a
              shelf carrying this business was drawn.
            </EmptyLine>
          ) : !chosen ? (
            <>
              <CountLine shown={businesses.length} total={businesses.length} what="businesses" q={q} />
              {businesses.length === 0 ? (
                <EmptyLine>Nothing by that name.</EmptyLine>
              ) : (
                businesses.map((b) => (
                  <Link key={b.id} href={`${base}?tab=shown&q=${encodeURIComponent(q)}&id=${b.id}${days === 30 ? "" : `&days=${days}`}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                    <Row>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
                      <span style={{ fontSize: 10, color: MUTED, flexShrink: 0 }}>{b.city ?? "—"}</span>
                      <span style={{ fontSize: 10, color: SUB, flexShrink: 0 }}>›</span>
                    </Row>
                  </Link>
                ))
              )}
            </>
          ) : (
            <>
              <Head>{chosen.name.toUpperCase()}</Head>
              {impressions.length === 0 ? (
                <EmptyLine>
                  Not shown once in the last {days} days. ⚠ That is a real answer and a different one from
                  “nobody booked”: a business nobody was shown and a business everybody ignored look
                  identical on every other screen in this panel, and they are opposite problems.
                </EmptyLine>
              ) : (
                <>
                  <Grid cols={2}>
                    <Fig n={impressions.reduce((n, i) => n + i.shown, 0)} label={`shelves in ${days} days`} />
                    <Fig
                      n={impressions[0].medianPosition === null ? "—" : `#${Math.round(impressions[0].medianPosition)}`}
                      label={`median place · ${surfaceWord(impressions[0].surface)}`}
                    />
                  </Grid>
                  {impressions.map((i) => (
                    <Row key={i.surface}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800 }}>{surfaceWord(i.surface)}</span>
                      <span style={{ fontSize: 10.5, color: SUB, flexShrink: 0 }}>
                        {i.medianPosition === null ? "place unknown" : `usually #${Math.round(i.medianPosition)}`}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 900, fontVariantNumeric: "tabular-nums", flexShrink: 0, minWidth: 34, textAlign: "right" }}>{i.shown}</span>
                    </Row>
                  ))}
                  <EmptyLine>
                    The place is a MEDIAN, not a mean: one very long shelf moves a mean and says nothing.
                    ⚠ Artists are not counted — an impression names a business, a class or a crew, and an
                    artist has been a person rather than a business since 18 Sep 2026.
                  </EmptyLine>
                </>
              )}
            </>
          )}
        </>
      ) : null}

      {/* ── DID THE MAIL ARRIVE ──────────────────────────────────────────── */}
      {tab === "email" ? (
        <>
          <DayPicker base={base} tab={tab} q={q} days={days} />
          {!webhookConfigured ? (
            /* ⚠⚠ WHICH OF THE TWO IT IS, SAID OUT LOUD. An empty ledger reads as
               "no mail has bounced" and it is not — nothing has been RECORDED at
               all. The route answers 503 rather than accepting unsigned posts,
               so until the secret is set this table cannot fill, and a measured
               zero here would be the most misleading figure in the panel. */
            <div style={{ background: "rgba(245,158,11,.12)", border: "1.5px solid rgba(245,158,11,.4)", borderRadius: 14, padding: "12px 13px", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#F59E0B" }}>The ledger is not recording yet</div>
              <div style={{ fontSize: 11, color: SUB, marginTop: 3, lineHeight: 1.5 }}>
                <code style={{ fontFamily: MONO, fontSize: 10.5 }}>RESEND_WEBHOOK_SECRET</code> is not set, so{" "}
                <code style={{ fontFamily: MONO, fontSize: 10.5 }}>/api/webhooks/resend</code> answers 503 rather
                than accepting unsigned posts. Nothing below is a measurement until a webhook at resend.com points
                here and that secret is in the environment — an empty ledger would otherwise read as “nothing
                bounced”, which is the opposite of what it means.
              </div>
            </div>
          ) : null}

          <Grid cols={3}>
            <Fig n={delivered} label={`delivered · ${days}d`} tone={delivered ? "#22C55E" : undefined} />
            <Fig n={bounced} label="bounced or complained" tone={bounced ? "#EF4444" : undefined} />
            <Fig n={totalMail} label="events recorded" />
          </Grid>

          {pulse.length > 0 ? (
            <>
              <Head>WHAT RESEND HAS TOLD US</Head>
              {pulse.map((p) => (
                <Row key={p.eventType}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: EVENT_TONE[p.eventType] ?? MUTED, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800 }}>{p.eventType.replace(/_/g, " ")}</span>
                  <span style={{ fontSize: 13, fontWeight: 900, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{p.n}</span>
                </Row>
              ))}
            </>
          ) : null}

          <Head>ONE ADDRESS</Head>
          <SearchBar action={base} q={q} placeholder="An email address" keep={keep} />
          {!q ? (
            <EmptyLine>
              The question “did they get it?”, asked about the person who says they did not. ⚠ A redelivery
              is a no-op rather than a second row, because the ledger is unique on the Svix message id — a
              log that counted a retry as a second bounce would invent a failure.
            </EmptyLine>
          ) : history.length === 0 ? (
            <EmptyLine>Nothing recorded for {q}.</EmptyLine>
          ) : (
            history.map((h) => (
              <Row key={`${h.messageId ?? ""}${h.at}${h.eventType}`}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: EVENT_TONE[h.eventType] ?? MUTED, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {h.subject ?? h.eventType.replace(/_/g, " ")}
                  </div>
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>
                    {h.eventType.replace(/_/g, " ")}
                    {h.detail ? ` · ${h.detail}` : ""}
                  </div>
                </div>
                <span style={{ fontSize: 10, color: MUTED, flexShrink: 0 }}>{when(h.at)}</span>
              </Row>
            ))
          )}
        </>
      ) : null}
    </div>
  );
}
