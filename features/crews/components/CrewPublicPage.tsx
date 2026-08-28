import Link from "next/link";
import { ProfileShare } from "@/features/profiles/components/ProfileShare";
import { gradientOf } from "@/features/profiles/components/PublicProfile";
import { dosStyleColor } from "@/lib/constants/styles";
import { CARD, DOS_DISPLAY, DOS_UI, GOLD, INK, LILAC, LINE, MUTED, SUB } from "@/lib/design/tokens";
import type { Crew, CrewEntry, CrewMember } from "@/types/crew";
import { EV_TINT } from "@/types/event";
import { initialsOf } from "./crew-kit";

/** A crew's public page — prototype S_profiletab with `publicEntity="crew"`
 *  (10565-11060, the crew branch at 11044): the same lit profile the studio
 *  and artist pages wear — CREW over the name, the QR beside it, where it is,
 *  the figures (Members, Events entered), the style as a coin — then the people
 *  in one language: Crew leader, headed with a count, then Crew members, or
 *  "Nobody else in the crew yet." Only CONFIRMED members are printed (RLS: an
 *  unanswered ask never puts a name on a public page). Under them, the battle
 *  record — each event a door to its page.
 *
 *  Not lifted, tracked in the backlog: Follow (follows target businesses;
 *  following a crew needs its own row), Enquiry, About, photos, the rank. */

const micro: React.CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase" };
const shelf: React.CSSProperties = { fontSize: 15, fontWeight: 900, letterSpacing: -0.3, fontFamily: DOS_DISPLAY };
const joinedYear = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date(iso));
const monthDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, d)));
};

function Person({ m, role }: { m: CrewMember; role: string }) {
  const g = gradientOf(m.name);
  return (
    /* the roster opens the people on it — the person page landed with the first
       parity slice, and a name you can tap is the whole point of a roster */
    <Link href={`/person/${m.userId}`} aria-label={`Open ${m.name}'s profile`} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 4px", minWidth: 0, color: INK, textDecoration: "none" }}>
      <span style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(150deg,${g[0]},${g[1]})`, color: "#fff", fontSize: 15, fontWeight: 900, letterSpacing: 0.4, fontFamily: DOS_DISPLAY }}>
        {initialsOf(m.name)}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
        <span style={{ display: "block", ...micro, color: role === "Crew leader" ? GOLD : MUTED, marginTop: 3 }}>
          {role}
          {m.city ? ` · ${m.city}` : ""}
        </span>
      </span>
    </Link>
  );
}

function Group({ title, n, children }: { title: string; n: number; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
        <span style={shelf}>{title}</span>
        <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{n}</span>
      </div>
      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 16, padding: "2px 11px" }}>{children}</div>
    </div>
  );
}

export function CrewPublicPage({ crew, members, entries, viewer, todayKey }: { crew: Crew; members: CrewMember[]; entries: CrewEntry[]; viewer: "leader" | "member" | "other"; todayKey: string }) {
  const RG = gradientOf(crew.name);
  const RC = RG[1];
  const SQ = 206;
  const sqShadow = "0 0 52px 20px rgba(0,0,0,.30), 0 26px 60px -4px rgba(0,0,0,.55), 0 8px 18px rgba(0,0,0,.4)";
  const lead = members.filter((m) => m.role === "leader");
  const rest = members.filter((m) => m.role !== "leader");
  const styleCol = dosStyleColor(crew.style);
  const path = `/crew/${crew.id}`;

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40, boxSizing: "border-box" }}>
      <div style={{ padding: "0 16px" }}>
        <div style={{ margin: "0 -16px", position: "relative", overflow: "hidden", background: `linear-gradient(180deg, ${RC}b8 0%, ${RC}55 46%, ${RC}18 74%, ${LILAC} 100%)` }}>
          <div style={{ display: "flex", justifyContent: "center", padding: "24px 0 14px" }}>
            <div aria-label={crew.name} style={{ width: SQ, height: SQ, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${RG[0]},${RG[1]})`, color: "#fff", fontSize: 64, fontWeight: 900, letterSpacing: 1, fontFamily: DOS_DISPLAY, boxShadow: sqShadow }}>
              {initialsOf(crew.name)}
            </div>
          </div>
          <div style={{ padding: "10px 16px 2px" }}>
            <div style={{ ...micro, letterSpacing: 2.2, color: "rgba(255,255,255,.9)" }}>CREW</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 24, fontWeight: 900, fontFamily: DOS_DISPLAY, letterSpacing: -0.8, lineHeight: 1.08, color: INK, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{crew.name}</span>
              <ProfileShare path={path} name={crew.name} />
            </div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 7, fontSize: 15, fontWeight: 700, color: SUB }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 800, color: INK }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                  <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
                  <path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2" />
                </svg>
                Since {joinedYear(crew.createdAt)}
              </span>
              <span style={{ color: LINE }}>·</span>
              <span style={{ fontWeight: 800, color: INK }}>{crew.city}</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 22, marginTop: 12, flexWrap: "wrap" }}>
              <span aria-label={`${members.length} members`}>
                <span data-testid="crew-members-count" style={{ display: "block", fontSize: 22, fontWeight: 900, lineHeight: 1, letterSpacing: -0.6, fontFamily: DOS_DISPLAY, color: INK, fontVariantNumeric: "tabular-nums" }}>
                  {members.length}
                </span>
                <span style={{ display: "block", ...micro, color: MUTED, marginTop: 4 }}>Members</span>
              </span>
              <span aria-label={`${entries.length} events entered`}>
                <span style={{ display: "block", fontSize: 22, fontWeight: 900, lineHeight: 1, letterSpacing: -0.6, fontFamily: DOS_DISPLAY, color: INK, fontVariantNumeric: "tabular-nums" }}>{entries.length}</span>
                <span style={{ display: "block", ...micro, color: MUTED, marginTop: 4 }}>Events</span>
              </span>
            </div>
          </div>
        </div>

        {/* the style, as a coin (DosStyleCoin 3400) */}
        <div style={{ display: "flex", gap: 6, padding: "14px 0 6px", alignItems: "center" }}>
          <span aria-label={crew.style} style={{ width: 34, height: 34, borderRadius: 17, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 12, fontFamily: DOS_DISPLAY, background: `linear-gradient(135deg,${styleCol} 0%, ${styleCol}cc 55%, ${styleCol}80 100%)`, boxShadow: "0 1px 4px rgba(0,0,0,.35)" }}>
            {crew.style.replace(/[^A-Za-z0-9 -]/g, " ").trim().split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "•"}
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: SUB, marginLeft: 4 }}>{crew.style}</span>
        </div>

        {/* what you can do here depends on who you are to the crew */}
        <div style={{ marginTop: 12 }}>
          {viewer === "leader" ? (
            <Link href={`/crews/${crew.id}/manage`} style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 38, borderRadius: 11, fontWeight: 800, fontSize: 11, background: CARD, color: INK, border: `1px solid ${LINE}`, textDecoration: "none" }}>
              You lead this crew · Manage ›
            </Link>
          ) : viewer === "member" ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 38, borderRadius: 11, fontWeight: 800, fontSize: 11, background: CARD, color: INK, border: `1px solid ${LINE}` }}>You are in this crew</div>
          ) : null}
        </div>

        {/* the people, in one language: a row per person, the group headed with a count */}
        {lead.length ? (
          <Group title="Crew leader" n={lead.length}>
            {lead.map((m) => (
              <Person key={m.id} m={m} role="Crew leader" />
            ))}
          </Group>
        ) : null}
        <Group title="Crew members" n={rest.length}>
          {rest.length ? rest.map((m) => <Person key={m.id} m={m} role={m.role === "trainee" ? "Trainee" : "Member"} />) : <div style={{ fontSize: 11.5, color: MUTED, padding: "10px 0" }}>Nobody else in the crew yet.</div>}
        </Group>

        {entries.length ? (
          <Group title="Battle record" n={entries.length}>
            {entries.map((e) => {
              const done = e.eventStatus === "completed" || e.endDate < todayKey;
              return (
                <Link key={e.bookingId} href={`/e/${e.eventShareSlug}`} aria-label={`Open ${e.eventTitle}`} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 4px", color: INK, textDecoration: "none" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: done ? LINE : EV_TINT[e.eventCat], flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.eventTitle}</span>
                    <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 2 }}>
                      {monthDay(e.startDate)} · {e.city} · {done ? "Completed" : "Entered"}
                    </span>
                  </span>
                  <span style={{ color: MUTED }}>›</span>
                </Link>
              );
            })}
          </Group>
        ) : null}
      </div>
    </div>
  );
}
