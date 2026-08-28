import Image from "next/image";
import Link from "next/link";
import { dosStyleColor } from "@/lib/constants/styles";
import { CARD, DOS_DISPLAY, DOS_UI, INK, LILAC, LINE, MUTED, SUB } from "@/lib/design/tokens";
import { CREW_ROLE_WORD } from "@/types/crew";
import type { ProfileRole } from "@/types/profile";
import { SIDE_TINT, SIDE_VERB, hoursWords } from "@/types/stats";
import { photoUrl } from "@/lib/media/photo";
import type { PublicPerson } from "@/repositories/publicPerson";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { PersonFollowButton } from "./PersonFollowButton";
import { ProfileShare } from "./ProfileShare";
import { fmtFollowers } from "./PublicProfile";
import { DosStyleTile } from "@/features/discovery/components/DiscoverFilters";
import { handleOf, isPlatform } from "@/lib/constants/socials";
import { memberNoWords } from "@/types/profile";
import { Group, PlaceLink, PlatformIcon, Row, SchedIcon, TYPE, bigWhite } from "./profile-kit";

/* one Group and one Row for both profile screens (they are the same rows) */
export { Group, Row };

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
const sinceWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" }).format(new Date(iso));

export function PublicPersonPage({ person, isMe, following, signedIn }: { person: PublicPerson; isMe: boolean; following: boolean; signedIn: boolean }) {
  const { profile, stats } = person;
  const ring = ROLE_RING[profile.role];
  const RC = ring[1];
  const SQ = 206;
  const sqShadow = "0 0 52px 20px rgba(0,0,0,.30), 0 26px 60px -4px rgba(0,0,0,.55), 0 8px 18px rgba(0,0,0,.4)";
  const path = `/person/${profile.id}`;
  const totalSessions = stats.sessionsConducted + stats.sessionsAssisted + stats.sessionsAttended;
  const totalHours = Math.round((stats.hoursConducted + stats.hoursAssisted + stats.hoursAttended) * 10) / 10;
  const face = photoUrl(profile.avatarPath);

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40, boxSizing: "border-box" }}>
      <div style={{ padding: "0 16px" }}>
        {/* ── the profile, lit like a player ── */}
        <div style={{ margin: "0 -16px", position: "relative", overflow: "hidden", background: `linear-gradient(180deg, ${RC}b8 0%, ${RC}55 46%, ${RC}18 74%, ${LILAC} 100%)` }}>
          <div style={{ display: "flex", justifyContent: "center", padding: "24px 0 14px" }}>
            <div aria-label={profile.fullName} style={{ width: SQ, height: SQ, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: `linear-gradient(135deg,${ring[0]},${ring[1]})`, color: "#fff", fontSize: 64, fontWeight: 900, letterSpacing: 1, fontFamily: DOS_DISPLAY, boxShadow: sqShadow }}>
              {/* a cover, not an avatar (10577) — the photo fills the square and
                  the initials are what stands there until there is one */}
              {face ? <Image src={face} alt="" width={SQ} height={SQ} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initialsOf(profile.fullName)}
            </div>
          </div>
          <div style={{ padding: "10px 16px 2px" }}>
            <div style={{ ...micro, letterSpacing: 2.2, color: "rgba(255,255,255,.9)" }}>{ROLE_BADGE[profile.role]}</div>
            {profile.memberNo ? <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, fontVariantNumeric: "tabular-nums", letterSpacing: 0.3, marginTop: 3 }}>{memberNoWords(profile.memberNo)}</div> : null}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span style={{ ...TYPE.display, color: INK, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.fullName}</span>
              <ProfileShare path={path} name={profile.fullName} />
            </div>
            {profile.city || profile.age ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, fontSize: 15, fontWeight: 700, color: SUB }}>
                {/* "24, New Delhi" — one introduction, not two facts (10664), and the
                    place opens Maps (10694-10698). A person has an age where a business
                    has a founding year — never both (10594). */}
                {profile.city ? (
                  <PlaceLink prefix={profile.age ? `${profile.age}, ` : ""} place={profile.city} />
                ) : (
                  <span style={{ fontWeight: 800, color: INK, fontVariantNumeric: "tabular-nums" }}>{profile.age}</span>
                )}
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

        {/* THE BAND UNDER THE NAME (10739): the styles they dance, where else to
            find them — a number is not a public handle, so WhatsApp stays off
            (10778) — and their own sentence */}
        {profile.styles.length ? (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", padding: "14px 0 6px", alignItems: "center" }}>
            {profile.styles.map((s) => (
              <DosStyleTile key={s} label={s} color={dosStyleColor(s)} />
            ))}
          </div>
        ) : null}
        {profile.socials.filter((l) => l.platform !== "WhatsApp").length ? (
          <div style={{ display: "flex", gap: 7, alignItems: "center", overflowX: "auto", scrollbarWidth: "none", margin: "0 0 4px", paddingBottom: 2 }}>
            {profile.socials
              .filter((l) => l.platform !== "WhatsApp")
              .map((l) => (
                <a key={l.platform} href={l.url} target="_blank" rel="noopener noreferrer" aria-label={`${l.platform} — ${isPlatform(l.platform) ? handleOf(l.url) : l.platform}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "6px 11px", borderRadius: 999, whiteSpace: "nowrap", background: CARD, border: `1px solid ${LINE}`, textDecoration: "none" }}>
                  <span style={{ flexShrink: 0, lineHeight: 0 }}><PlatformIcon label={l.platform} size={15} /></span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#5AC8FA" }}>{isPlatform(l.platform) ? handleOf(l.url) : l.platform}</span>
                </a>
              ))}
          </div>
        ) : null}
        {profile.about ? (
          <div style={{ margin: "16px 0 4px" }}>
            <div style={{ ...TYPE.shelf, color: INK, marginBottom: 6 }}>About</div>
            <div style={{ fontSize: 13.5, color: SUB, lineHeight: 1.62 }}>{profile.about}</div>
          </div>
        ) : null}

        {/* the one thing you can do to a person, or the door to your own page */}
        <div style={{ marginTop: 12 }}>
          {isMe ? (
            <>
              <Link href="/stats" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 38, borderRadius: 11, fontWeight: 800, fontSize: 11, background: CARD, color: INK, border: `1px solid ${LINE}`, textDecoration: "none" }}>
                This is you · Your record ›
              </Link>
              <div style={{ marginTop: 8 }}>
                <PhotoPicker owner={{ kind: "avatar", id: profile.id }} hasPhoto={Boolean(profile.avatarPath)} label="Change your photo" />
              </div>
            </>
          ) : (
            <PersonFollowButton userId={profile.id} initialFollowing={following} accent={RC} signedIn={signedIn} />
          )}
        </div>

        {/* THE PLACE THIS PROFILE GOES (10905-10940): a business's schedule is a
            list of sessions you can still book — a person's record is not a
            stranger's to read, so Stats is not offered here (dance_chart takes no
            p_user_id by design). */}
        {person.runs.length ? (
          <div style={{ marginTop: 8 }}>
            <Link href={`/${person.runs[0].tenantType === "studio" ? "studio" : "artist"}/${person.runs[0].tenantId}/schedule`} aria-label="Schedule" style={bigWhite}>
              <SchedIcon />
              Schedule
            </Link>
          </div>
        ) : null}

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
                markName={c.name}
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
                markName={t.tenantName}
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
                markName={t.tenantName}
                photo={t.photoPath ? photoUrl(t.photoPath) : null}
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
