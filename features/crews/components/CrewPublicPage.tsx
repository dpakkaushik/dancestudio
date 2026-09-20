import Link from "next/link";
import { EnquiryButton } from "@/features/enquiries/components/EnquirySheet";
import { ActionRow, CallButton, MailButton } from "@/features/profiles/components/ContactButtons";
import { EntityBand, Figure } from "@/features/profiles/components/profile-band";
import { FollowToggle } from "@/features/profiles/components/FollowToggle";
import type { HeroShot } from "@/features/profiles/components/HeroRail";
import { ProfileShare } from "@/features/profiles/components/ProfileShare";
import { StatsChip } from "@/features/profiles/components/StatsChip";
import { HeroDot, HeroId, IdentityHero } from "@/features/profiles/components/hero-kit";
import { memberNoWords } from "@/types/profile";
import { EntityMark, Group, TYPE, smallBox } from "@/features/profiles/components/profile-kit";
import { DOS_UI, GOLD, INK, LILAC, LINE, MUTED, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import { CREW_GRAD, type Crew, type CrewEntry, type CrewMember } from "@/types/crew";
import { EV_TINT } from "@/types/event";

/** A CREW'S PUBLIC PAGE — prototype S_profiletab with `publicEntity="crew"`
 *  (10565-11060, the crew branch at 11044). SINCE 19 Sep 2026 IT STANDS ON THE
 *  ONE HERO EVERY PROFILE PAGE WEARS — `IdentityHero`: the header swiping
 *  through up to five pictures, the crew's photo on the disc, CREW over the
 *  name, the QR and the crew board's Stats chip stacked on the right, Since ·
 *  the city, the style as the app's one tile. It drew its own 206 square until
 *  today, the last page that did.
 *
 *  Under the hero, in the order every public page now shares (the user's list):
 *  **Follow · Following** — a crew can be followed now (`follows.crew_id`) —
 *  the **buttons** a crew's page carries — Enquiry · Mail — then the
 *  **associations**: Crew leader, Crew members, and the battle record. NO
 *  FIGURES: the Members · Events pair under the name is gone. Only CONFIRMED
 *  members are printed (an unanswered ask never puts a name on a public page).
 *
 *  Who sees what: the LEADER gets the door to the crew's home; a MEMBER is told
 *  they are in it; anybody else gets Follow and Enquiry (the leader and the
 *  members ARE the crew, so neither is offered to them). */

const joinedYear = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date(iso));
const monthDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, d)));
};

function Person({ m, role }: { m: CrewMember; role: string }) {
  return (
    /* the roster opens the people on it — a name you can tap is the whole point of a roster */
    <Link href={`/person/${m.userId}`} aria-label={`Open ${m.name}'s profile`} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 4px", minWidth: 0, color: INK, textDecoration: "none" }}>
      <EntityMark name={m.name} photo={photoUrl(m.avatarPath)} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
        <span style={{ display: "block", ...TYPE.micro, color: role === "Crew leader" ? GOLD : MUTED, marginTop: 3 }}>
          {role}
          {m.city ? ` · ${m.city}` : ""}
        </span>
      </span>
      <span aria-hidden="true" style={{ flexShrink: 0, color: LINE, fontSize: 15, fontWeight: 600 }}>›</span>
    </Link>
  );
}

export function CrewPublicPage({
  crew,
  members,
  entries,
  header = [],
  viewer,
  following = false,
  followers = null,
  canFollow = true,
  signedIn,
  todayKey,
}: {
  crew: Crew;
  members: CrewMember[];
  entries: CrewEntry[];
  /** THE HEADER PICTURES (19 Sep 2026): up to five, the leader's to add */
  header?: HeaderPhoto[];
  viewer: "leader" | "member" | "other";
  following?: boolean;
  /** the live follower count, printed on the Follow button (19 Sep 2026, later) */
  followers?: number | null;
  /** false for an organization viewer — one follows nothing */
  canFollow?: boolean;
  /** a stranger who is signed out is offered Follow and Enquiry as doors to sign in */
  signedIn: boolean;
  todayKey: string;
}) {
  const RG = CREW_GRAD;
  const RC = RG[1];
  const lead = members.filter((m) => m.role === "leader");
  const rest = members.filter((m) => m.role !== "leader");
  const path = `/crew/${crew.id}`;
  const shots: HeroShot[] = header.filter((h) => h.url).map((h, i) => ({ key: h.id, src: h.url as string, alt: `Header picture ${i + 1} of ${crew.name}`, signed: h.signed }));

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40, boxSizing: "border-box" }}>
      <div style={{ padding: "0 16px" }}>
        <IdentityHero
          testId="crew-public-hero"
          name={crew.name}
          grad={RG}
          tint={RC}
          eyebrow="Crew"
          eyebrowSub={crew.memberNo ? <HeroId>{memberNoWords(crew.memberNo)}</HeroId> : null}
          verified={false}
          share={<ProfileShare path={path} name={crew.name} />}
          /* STATS IS THE CHIP UNDER THE QR (19 Sep 2026): since push 2 THIS crew's
             figures and its place on the crew board, on a page of its own */
          stats={<StatsChip href={`${path}/stats`} />}
          meta={
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 800, color: INK }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                  <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
                  <path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2" />
                </svg>
                Since {joinedYear(crew.createdAt)}
              </span>
              <HeroDot />
              <span>{crew.city}</span>
            </>
          }
          /* ⚠ the BAND draws the style (20 Sep 2026) — the hero renders its own
             `styles` prop before `children`, and the order is figures → styles */
          styles={[]}
          avatar={photoUrl(crew.photo)}
          avatarAlt={crew.name}
          shots={shots}
        >
          {/* ── THE SAME BAND HOME WEARS (20 Sep 2026). A crew follows nobody, so
              followers alone; `crews` has no `socials` column, so no links row —
              an empty rail is not a row. ── */}
          <EntityBand
            figures={<Figure n={followers} label={followers === 1 ? "Follower" : "Followers"} />}
            styles={[crew.style]}
            styleAria={(s) => `${s} — the crew's style`}
          />
        </IdentityHero>

        {/* ── what you can do here depends on who you are to the crew ── */}
        <div style={{ marginTop: 12 }}>
          {viewer === "leader" ? (
            <Link href={`/crews/${crew.id}/manage`} style={smallBox(false, RC)}>
              You lead this crew · Manage ›
            </Link>
          ) : viewer === "member" ? (
            <div style={{ ...smallBox(false, RC), cursor: "default" }}>You are in this crew</div>
          ) : canFollow ? (
            <FollowToggle target={{ kind: "crew", id: crew.id }} initialFollowing={following} initialFollowers={followers} accent={RC} signedIn={signedIn} />
          ) : null}
        </div>

        {/* ── THE BUTTONS A CREW'S PAGE CARRIES (19 Sep 2026): Enquiry · Mail — the
            enquiry a celebration, a corporate show or a collaboration, answered by
            the leader from the crew's Inbox ── */}
        <ActionRow marginTop={6}>
          {viewer === "other" ? <EnquiryButton tenantId={crew.id} crewId={crew.id} tenantName={crew.name} tenantType="artist_page" signedIn={signedIn} accent={RC} /> : null}
          {/* CALL IS A SWITCH (push 2): the number reaches this page only while the leader's switch is on — the policy on crew_contacts is the switch */}
          {crew.phone && crew.phonePublic ? <CallButton phone={crew.phone} /> : null}
          {crew.contactEmail ? <MailButton email={crew.contactEmail} /> : null}
        </ActionRow>

        {/* ── THE ASSOCIATIONS, in one language: a row per person, the group headed with a count ── */}
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
