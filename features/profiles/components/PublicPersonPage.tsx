import Link from "next/link";
import { CrewI } from "@/features/crews/components/crew-kit";
import { dosStyleColor } from "@/lib/constants/styles";
import { CARD, DOS_DISPLAY, DOS_UI, GOLD, INK, LILAC, LINE, MUTED, SUB } from "@/lib/design/tokens";
import { CREW_ROLE_WORD } from "@/types/crew";
import type { ProfileRole } from "@/types/profile";
import { SIDE_TINT, SIDE_VERB, hoursWords } from "@/types/stats";
import type { PublicPerson } from "@/repositories/publicPerson";
import { PersonFollowButton } from "./PersonFollowButton";
import { ProfileShare } from "./ProfileShare";
import { fmtFollowers } from "./PublicProfile";

/** A person's page — prototype S_profiletab with `publicEntity="trainer"`, which
 *  in the prototype IS a person (PUB 8643: a name, a badge, a place, followers and
 *  following). The same skeleton the studio and crew pages wear, because it is
 *  the same screen: the person's colour bleeding off the top and dying into the
 *  page, the picture as a sharp square with the sleeve's thrown shadow, the role
 *  over the name, the QR beside it, the place under it, then the figures set like
 *  figures — and under them the people-and-places groups, each headed with a
 *  count (11000-11060).
 *
 *  What it is made of is only what this app can say truthfully: the person's
 *  record (Step 25's arithmetic, keyed on them), the crews they are CONFIRMED in
 *  (an unanswered ask never appears — Step 22), where they teach (confirmed
 *  claims on PUBLISHED classes of LISTED businesses — Step 11's public policy),
 *  and any business they own that is listed.
 *
 *  Signed-in only, and deliberately: `profiles` is readable by signed-in users
 *  (Step 1) and every figure here is one Step 25's boards already print beside a
 *  name. Making a person page PUBLIC is a decision about somebody else's data,
 *  and it is not one to take in passing — it stays on the backlog.
 *
 *  Not lifted, tracked in the backlog: the photo (no media yet — the square is
 *  the person's initials on their own gradient), About / age / experience (no
 *  fields), Call and the enquiry sheet (a person holds no number and enquiries
 *  target businesses), the albums tabs, and the rank ladder. */

const micro: React.CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase" };
const shelf: React.CSSProperties = { fontSize: 15, fontWeight: 900, letterSpacing: -0.3, fontFamily: DOS_DISPLAY };
const figure: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontWeight: 700, fontVariantNumeric: "tabular-nums" };

/** the badge over the name — the prototype's own words for what somebody is */
const ROLE_BADGE: Record<ProfileRole, string> = { dancer: "DANCER", trainer: "ARTIST", studio: "STUDIO OWNER" };
/** DOS_RINGS (1462): the metal each role wears */
const ROLE_RING: Record<ProfileRole, [string, string]> = {
  studio: ["#F9E27D", "#B8860B"],
  trainer: ["#F2F2F2", "#8E9BAE"],
  dancer: ["#F0BC8A", "#8C5A2B"],
};

const initialsOf = (name: string) => name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "D";
const monthWords = (d: string | null) => (d ? new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "short", year: "numeric" }).format(new Date(`${d}T00:00:00Z`)) : null);
const sinceWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" }).format(new Date(iso));

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

function Row({ href, mark, title, sub, right }: { href?: string; mark: React.ReactNode; title: string; sub: string; right?: string }) {
  const body = (
    <>
      <span style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", background: LINE }}>{mark}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <span style={{ display: "block", ...micro, color: MUTED, marginTop: 3 }}>{sub}</span>
      </span>
      {right ? <span style={{ ...micro, color: GOLD, flexShrink: 0 }}>{right}</span> : null}
    </>
  );
  const style: React.CSSProperties = { display: "flex", alignItems: "center", gap: 11, padding: "9px 4px", minWidth: 0, color: INK, textDecoration: "none" };
  return href ? (
    <Link href={href} aria-label={`Open ${title}`} style={style}>
      {body}
    </Link>
  ) : (
    <div style={style}>{body}</div>
  );
}

export function PublicPersonPage({ person, isMe, following, signedIn }: { person: PublicPerson; isMe: boolean; following: boolean; signedIn: boolean }) {
  const { profile, stats } = person;
  const ring = ROLE_RING[profile.role];
  const RC = ring[1];
  const SQ = 206;
  const sqShadow = "0 0 52px 20px rgba(0,0,0,.30), 0 26px 60px -4px rgba(0,0,0,.55), 0 8px 18px rgba(0,0,0,.4)";
  const path = `/person/${profile.id}`;
  const totalSessions = stats.sessionsConducted + stats.sessionsAssisted + stats.sessionsAttended;
  const totalHours = Math.round((stats.hoursConducted + stats.hoursAssisted + stats.hoursAttended) * 10) / 10;
  const from = monthWords(stats.firstSession);

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40, boxSizing: "border-box" }}>
      <div style={{ padding: "0 16px" }}>
        {/* ── the profile, lit like a player ── */}
        <div style={{ margin: "0 -16px", position: "relative", overflow: "hidden", background: `linear-gradient(180deg, ${RC}b8 0%, ${RC}55 46%, ${RC}18 74%, ${LILAC} 100%)` }}>
          <div style={{ display: "flex", justifyContent: "center", padding: "24px 0 14px" }}>
            <div aria-label={profile.fullName} style={{ width: SQ, height: SQ, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${ring[0]},${ring[1]})`, color: "#fff", fontSize: 64, fontWeight: 900, letterSpacing: 1, fontFamily: DOS_DISPLAY, boxShadow: sqShadow }}>
              {initialsOf(profile.fullName)}
            </div>
          </div>
          <div style={{ padding: "10px 16px 2px" }}>
            <div style={{ ...micro, letterSpacing: 2.2, color: "rgba(255,255,255,.9)" }}>{ROLE_BADGE[profile.role]}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 24, fontWeight: 900, fontFamily: DOS_DISPLAY, letterSpacing: -0.8, lineHeight: 1.08, color: INK, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.fullName}</span>
              <ProfileShare path={path} name={profile.fullName} />
            </div>
            {profile.city ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, fontSize: 15, fontWeight: 700, color: SUB }}>
                <span style={{ fontWeight: 800, color: INK }}>{profile.city}</span>
                {from ? (
                  <>
                    <span style={{ color: LINE }}>·</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>dancing on DanceOS since {from}</span>
                  </>
                ) : null}
              </div>
            ) : null}

            {/* the figures, at the size of figures */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 22, marginTop: 12, flexWrap: "wrap" }}>
              <span aria-label={`${person.followers} followers`}>
                <span data-testid="person-followers" style={{ display: "block", fontSize: 22, fontWeight: 900, lineHeight: 1, letterSpacing: -0.6, fontFamily: DOS_DISPLAY, color: INK, fontVariantNumeric: "tabular-nums" }}>
                  {fmtFollowers(person.followers)}
                </span>
                <span style={{ display: "block", ...micro, color: MUTED, marginTop: 4 }}>Followers</span>
              </span>
              <span aria-label={`following ${person.following}`}>
                <span style={{ display: "block", fontSize: 22, fontWeight: 900, lineHeight: 1, letterSpacing: -0.6, fontFamily: DOS_DISPLAY, color: INK, fontVariantNumeric: "tabular-nums" }}>{fmtFollowers(person.following)}</span>
                <span style={{ display: "block", ...micro, color: MUTED, marginTop: 4 }}>Following</span>
              </span>
              <span aria-label={`${totalSessions} sessions`}>
                <span style={{ display: "block", fontSize: 22, fontWeight: 900, lineHeight: 1, letterSpacing: -0.6, fontFamily: DOS_DISPLAY, color: INK, fontVariantNumeric: "tabular-nums" }}>{totalSessions}</span>
                <span style={{ display: "block", ...micro, color: MUTED, marginTop: 4 }}>Sessions</span>
              </span>
              <span aria-label={`${totalHours} hours on the floor`}>
                <span style={{ display: "block", fontSize: 22, fontWeight: 900, lineHeight: 1, letterSpacing: -0.6, fontFamily: DOS_DISPLAY, color: INK, fontVariantNumeric: "tabular-nums" }}>{hoursWords(totalHours)}</span>
                <span style={{ display: "block", ...micro, color: MUTED, marginTop: 4 }}>On the floor</span>
              </span>
            </div>
          </div>
        </div>

        {/* the one thing you can do to a person, or the door to your own page */}
        <div style={{ marginTop: 12 }}>
          {isMe ? (
            <Link href="/stats" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 38, borderRadius: 11, fontWeight: 800, fontSize: 11, background: CARD, color: INK, border: `1px solid ${LINE}`, textDecoration: "none" }}>
              This is you · Your record ›
            </Link>
          ) : (
            <PersonFollowButton userId={profile.id} initialFollowing={following} initialFollowers={person.followers} accent={RC} signedIn={signedIn} />
          )}
        </div>

        {/* the record, three sides — the same numbers /stats prints for yourself */}
        {totalSessions > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 16 }}>
            {(
              [
                ["conducted", stats.sessionsConducted, stats.hoursConducted],
                ["assisted", stats.sessionsAssisted, stats.hoursAssisted],
                ["attended", stats.sessionsAttended, stats.hoursAttended],
              ] as Array<["conducted" | "assisted" | "attended", number, number]>
            ).map(([k, n, h]) => (
              <div key={k} aria-label={`${SIDE_VERB[k]} — ${n} sessions, ${hoursWords(h)}`} style={{ background: CARD, border: `1px solid ${LINE}`, borderTop: `3px solid ${SIDE_TINT[k]}`, borderRadius: 14, padding: "11px 10px" }}>
                <div style={{ ...figure, fontSize: 20 }}>{n}</div>
                <div style={{ ...micro, color: SUB, marginTop: 3 }}>{SIDE_VERB[k]}</div>
                <div style={{ ...figure, fontSize: 10, color: SIDE_TINT[k], marginTop: 3 }}>{hoursWords(h)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: CARD, border: `1.5px dashed ${LINE}`, borderRadius: 16, padding: "20px 16px", marginTop: 16, textAlign: "center" }}>
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>No sessions on the record yet</div>
            <div style={{ fontSize: 10.5, color: SUB, marginTop: 3, lineHeight: 1.5 }}>A session lands here once it has ended and they were on the floor for it — taught, assisted, or checked in.</div>
          </div>
        )}

        {/* the crews they are IN — confirmed only (Step 22) */}
        {person.crews.length ? (
          <Group title="Crews" n={person.crews.length}>
            {person.crews.map((c) => (
              <Row
                key={c.crewId}
                href={`/crew/${c.crewId}`}
                mark={<CrewI size={18} color={c.role === "leader" ? GOLD : "var(--sub)"} />}
                title={c.name}
                sub={`${c.style} · ${c.city} · since ${sinceWords(c.since)}`}
                right={c.role === "leader" ? "Leads this crew" : CREW_ROLE_WORD[c.role]}
              />
            ))}
          </Group>
        ) : null}

        {/* where they teach — public confirmed claims only (Step 11) */}
        {person.teachesAt.length ? (
          <Group title="Teaches at" n={person.teachesAt.length}>
            {person.teachesAt.map((t) => (
              <Row
                key={t.tenantId}
                href={`/${t.tenantType === "studio" ? "studio" : "artist"}/${t.tenantId}`}
                mark={<span style={{ fontSize: 15, fontWeight: 900, color: GOLD, fontFamily: DOS_DISPLAY }}>{initialsOf(t.tenantName)}</span>}
                title={t.tenantName}
                sub={[t.kinds, `${t.classes} class${t.classes === 1 ? "" : "es"}`, t.city].filter(Boolean).join(" · ")}
              />
            ))}
          </Group>
        ) : null}

        {/* and what they run */}
        {person.runs.length ? (
          <Group title="Runs" n={person.runs.length}>
            {person.runs.map((t) => (
              <Row
                key={t.tenantId}
                href={`/${t.tenantType === "studio" ? "studio" : "artist"}/${t.tenantId}`}
                mark={<span style={{ fontSize: 15, fontWeight: 900, color: dosStyleColor(t.tenantName), fontFamily: DOS_DISPLAY }}>{initialsOf(t.tenantName)}</span>}
                title={t.tenantName}
                sub={[t.tenantType === "studio" ? "Studio" : "Artist business", t.city].filter(Boolean).join(" · ")}
              />
            ))}
          </Group>
        ) : null}
      </div>
    </div>
  );
}
