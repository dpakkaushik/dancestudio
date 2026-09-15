import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";
import { findMyDeck, findStudioDeck } from "@/repositories/home";
import { findMyPendingInvites } from "@/repositories/invites";
import { findMyTenants } from "@/repositories/tenants";
import { findMyArtistPlan } from "@/repositories/plans";
import { findMyOrgTenantId } from "@/repositories/orgStanding";
import { findSupportThreads } from "@/repositories/support";
import { findMyPlace } from "@/repositories/stats";
import { findPersonHeaderPhotos } from "@/repositories/headerPhotos";
import { ProfileShare } from "@/features/profiles/components/ProfileShare";
import { amIPlatformAdmin } from "@/repositories/admin";
import { headerMaxFor, photoUrl } from "@/lib/media/photo";
import { CARD, DOS_DISPLAY, DOS_UI, GOLD, INK, LILAC, MUTED, SUB } from "@/lib/design/tokens";
import { BizSection, HOME_TYPE } from "@/features/home/components/home-kit";
import { HEAD_LINK, PILL_DARK, PILL_LIGHT, TodayShelf } from "@/features/home/components/TodayShelf";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { EditProfileButton } from "@/features/profiles/components/EditProfileSheet";
import { HeaderRemove } from "@/features/profiles/components/HeaderRemove";
import type { HeroShot } from "@/features/profiles/components/HeroRail";
import { HeroPlace, IdentityHero } from "@/features/profiles/components/hero-kit";
import { ROLE_RING, tierOf } from "@/features/profiles/components/profile-kit";
import { KIND_WORD, kindOf, memberNoWords } from "@/types/profile";
import { MEMBER_ROLE_WORD } from "@/types/staff";

const IST = "Asia/Kolkata";

/** Time-of-day greeting — prototype Home (DanceOSApp.jsx:7212-7213), on the IST clock. */
const greeting = (now: Date): string => {
  const hr = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: IST }).format(now));
  return hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
};

/** Home — the dancer dashboard lifted from prototype S_homedancer (DanceOSApp.jsx:7206-7352):
 *  the identity sleeve with the time-of-day greeting, the PassDeck of today under
 *  "Today's schedule" (6863-7204 — one swiped rail of the app's own cards, the role chip,
 *  one Live badge, the QR and the invoice on a booked card), and the Artist Tools grid
 *  (BizSection). A studio's Home asks the deck the studio's question — what is running
 *  in its rooms — with its own doors (7022-7060, 7139-7150).
 *
 *  THE SLEEVE IS THE IDENTITY HERO NOW (14 Sep 2026, the user: "make sure all 4
 *  profile pages share common looking user interface and common code base").
 *  The prototype's Home wore an 86px square of initials beside the greeting; the
 *  app's Home wears the profile hero — the same object a studio's own home
 *  stands on. SINCE 15 SEP 2026 THAT IS TWO PICTURES: the HEADER across the
 *  top (a user's one picture, an artist's up to ten with the Add tile at the
 *  end, nothing for an organization) and the round PROFILE DISC over its
 *  bottom-left edge — the face, or the logo — with the ＋ that changes it on
 *  its rim. Under it, what the prototype's sleeve said: the greeting, the
 *  name, "24, New Delhi", the styles, the role word over the account number,
 *  and the rank in the metal it earned. */
export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const profile = await findProfileById(supabase, user.id);
  if (!profile) {
    /* a platform admin is ADMIN ONLY (9 Sep 2026): no profile, no Home — the queue is its place */
    redirect((await amIPlatformAdmin(supabase)) ? "/admin/verifications" : "/onboarding");
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const isOrg = profile.role === "org";
  /* WHERE AN ORGANIZATION STANDS WITH DANCEOS BELONGS HERE (R13, 9 Sep 2026):
     the badge on its own name, the steps, and the door to a person — not two
     taps away behind "Studios". A person's Home asks for none of it.
     ⚠ FOUR READS LEFT THIS LIST ON 11 Sep 2026 — the verification request, the
     proof photos, the plan catalogue and the support threads all fed the
     six-step organization card, and that card became the GST card. They were
     four round-trips on every single Home load for a component that is not
     drawn any more; what is still asked for is what is still shown. */
  const [tenants, invites, plan, eventsHostId, threads] = await Promise.all([
    findMyTenants(supabase),
    // somebody asked you onto their team — matched on the address you sign in
    // with, so an invite arrives here without any link being passed around
    findMyPendingInvites(supabase),
    isOrg ? Promise.resolve(null) : findMyArtistPlan(supabase),
    /* R15: the organization's ONE events host, so Studio Tools can carry an
       Events tile (11 Sep 2026) — the desk existed, the door from Home did not */
    isOrg ? findMyOrgTenantId(supabase).catch(() => null) : Promise.resolve(null),
    /* THE ONE READ THAT CAME BACK (11 Sep 2026). The six-step card carried the
       door to the organization's conversation with DanceOS, and with the card
       gone an organization that had written in had no way back to the reply
       from Home. One read, drawn only when a thread exists. */
    isOrg ? findSupportThreads(supabase).catch(() => []) : Promise.resolve([]),
  ]);
  /* the newest conversation, and whether DanceOS has said something unread */
  const thread = threads[0] ?? null;
  const unread = threads.reduce((n, t) => n + t.unread, 0);
  /* what the sleeve calls you: an organization is one; a person is an artist while the plan is live */
  const isArtist = Boolean(plan?.active);
  const kind = kindOf(profile.role, isArtist);

  /* THE HEADER PICTURES (15 Sep 2026): what swipes across the top. A user has
     one, an artist ten — the plan decides, here and in the database — and a
     plan that lapsed with ten stored still draws one; the rest wait. An
     organization's header is empty: it is not a place and has no body of work. */
  const headerMax = isOrg ? 0 : headerMaxFor(isArtist);
  const header = isOrg ? [] : await findPersonHeaderPhotos(supabase, user.id, headerMax);

  /* WHERE YOU STAND, ON THE SLEEVE THAT SAYS WHO YOU ARE (7324-7333). The place
     is Step 25's own — the same RPC the Profile tab and the boards ask — and a
     studio is not on a dancer's ladder, so it is not asked for one. */
  const chartSeg = isArtist ? "artist" : "dancer";
  const rank = profile.role === "org" ? null : await findMyPlace(supabase, chartSeg);
  const tier = rank ? tierOf(rank.place) : null;

  /* a studio's day is not a person's day (7022-7060): a studio owner's Home shows
     what is running in the studio's rooms, drawn by the same card in the same rail */
  const studio = isOrg ? (tenants.find((t) => t.type === "studio") ?? null) : null;
  /* AN UNVERIFIED ORGANIZATION'S HOME IS THE STANDING CARD AND NOTHING ELSE
     (10 Sep 2026, the user's ask). Until DanceOS has said yes it owns no studio
     and cannot make one, so "Today's schedule" is always empty and every Studio
     Tools tile is a door to an empty room — the prototype's own objection to
     offering Manage to somebody who manages nothing (7135). The tab bar is the
     chrome's, so Discover, Inbox and Profile are all still a tap away. */
  /* ⚠ NOTHING IS WITHHELD FROM AN ORGANIZATION ANY MORE (11 Sep 2026). This
     was `isOrg && !profile.verifiedAt`, and it hid the deck and Studio Tools
     from every organization until an admin had looked at it — which was the
     right shape when the ORGANIZATION was what got reviewed. Now a studio is
     reviewed, after it exists, so an organization that has just signed up has
     work to do from its first minute: open a studio, put it on the map, add
     its photos, ask for the badge. It stays a constant so the two folds below
     keep reading as a decision rather than as dead code. */
  const orgAwaitingApproval = false;
  const deck = studio ? await findStudioDeck(supabase, studio, nowIso) : await findMyDeck(supabase, user.id, nowIso, tenants);

  /* the metal the KIND wears (DOS_RINGS 1462): gold for an organization, silver
     for an artist, bronze for a user — the same pair the Profile tab paints with */
  const ring = ROLE_RING[kind];
  const face = photoUrl(profile.avatarPath);
  /* "24, New Delhi" — one string with a comma, the way you'd introduce somebody (7295-7306) */
  const place = profile.city ?? "";
  const metaLine = [profile.age != null ? String(profile.age) : "", place].filter(Boolean).join(", ");
  /* Manage only appears if you actually run something (7135): the door to what you
     manage, and offering it to somebody who manages nothing is a door onto an empty room */
  const canManage = tenants.length > 0;
  /* The Studio Tools doors are a STUDIO's — classes, rooms, students, the team.
     R15 (9 Sep 2026) gave every organization a hidden `org` tenant to hang its
     events on, and it is created first, so `tenants[0]` is no longer the
     business anybody means: an organization's tools open its first studio. */
  const firstTenant = (isOrg ? studio?.id : tenants.find((t) => t.type !== "org")?.id) ?? null;

  /* the header, each picture with its ✕ — this is the person's own Home */
  const shots: HeroShot[] = header
    .filter((g) => g.url)
    .map((g, i) => ({ key: g.id, src: g.url as string, alt: `Header picture ${i + 1} of ${profile.fullName}`, corner: <HeaderRemove target={{ kind: "person", id: g.id }} path={g.path} /> }));

  return (
    <div
      style={{
        background: LILAC,
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        boxSizing: "border-box",
      }}
    >
      <div style={{ padding: "0 16px" }}>
        {/* identity hero — the same object the profile and a studio's home wear (prototype 7248-7339, 10575) */}
        <IdentityHero
          name={profile.fullName}
          grad={ring}
          tint={ring[1]}
          eyebrow={greeting(now)}
          /* the tick is DanceOS's to give (7292) — set when a verification actually clears.
             ⚠ NO CHIP ON AN ORGANIZATION'S NAME ANY MORE (11 Sep 2026): nobody
             looks at an organization now, the badge moved to the studio. An
             organization verified under the old model keeps its tick. */
          verified={Boolean(profile.verifiedAt)}
          /* the QR beside the name shares this person (7288); an organization
             has no public page to share (8 Sep 2026) — its studios have theirs */
          share={profile.role === "org" ? null : <ProfileShare path={`/person/${profile.id}`} name={profile.fullName} />}
          meta={metaLine ? place ? <HeroPlace text={metaLine} query={place} /> : <span style={{ fontVariantNumeric: "tabular-nums" }}>{metaLine}</span> : null}
          /* the styles you dance, as the app's one style tile (7330, DosStyleRow) */
          styles={profile.styles}
          styleAria={(s) => `${s} — a style you dance`}
          /* the disc is the face — or the logo — and its ＋ (10600) is the one place you change it */
          avatar={face}
          avatarAlt={profile.fullName}
          avatarPicker={<PhotoPicker owner={{ kind: "avatar", id: profile.id }} hasPhoto={Boolean(profile.avatarPath)} label="Change your photo" overlay />}
          shots={shots}
          /* the Add tile ends the header while there is room: one for a user, ten for an artist */
          addTile={header.length < headerMax ? <PhotoPicker owner={{ kind: "gallery", id: profile.id }} hasPhoto={false} label="Add a header picture" tile /> : undefined}
          addLabel="Add a header picture"
          /* EDIT PROFILE, FROM HOME (15 Sep 2026, the user: "where is the edit
             profile button?") — the pencil on the hero's corner (10613), opening
             the Profile tab's own sheet: name, mobile, the pictures, the rest */
          corner={<EditProfileButton profile={profile} header={header} headerMax={headerMax} />}
        >
          {/* what you are, not what your number is (7308-7323): the role is the word,
              the account number the small line under it */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 22, marginTop: 12, flexWrap: "wrap" }}>
            <Link href="/profile" aria-label="Open your profile" style={{ textDecoration: "none", color: INK }}>
              <span style={{ display: "block", fontSize: 20, fontWeight: 900, lineHeight: 1, letterSpacing: -0.5, fontFamily: DOS_DISPLAY, color: INK }}>
                {KIND_WORD[kind]}
              </span>
              {profile.memberNo != null ? (
                <span style={{ display: "block", ...HOME_TYPE.micro, color: MUTED, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                  {memberNoWords(profile.memberNo)}
                </span>
              ) : null}
            </Link>
            {/* the rank, in the metal it earned — drawn only once there IS a place
                to stand, because Step 25's rule is that "#0" is not a rank (7324-7333) */}
            {rank && tier ? (
              <Link
                href={`/stats?tab=charts&seg=${chartSeg}`}
                aria-label={`Rank ${rank.place} of ${rank.population} — open global rankings`}
                style={{ textDecoration: "none" }}
              >
                <span style={{ display: "flex", alignItems: "baseline", gap: 1, lineHeight: 1, filter: `drop-shadow(0 2px 10px ${tier.text}44)` }}>
                  <span style={{ fontSize: 13, fontWeight: 900, fontFamily: DOS_DISPLAY, color: tier.text, opacity: 0.8 }}>#</span>
                  <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.8, fontFamily: DOS_DISPLAY, fontVariantNumeric: "tabular-nums", background: `linear-gradient(135deg,${tier.ring[0]},${tier.ring[1]})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                    {rank.place}
                  </span>
                </span>
                <span style={{ display: "block", ...HOME_TYPE.micro, color: tier.text, marginTop: 4 }}>{tier.label} rank</span>
              </Link>
            ) : null}
          </div>
        </IdentityHero>

        {/* ── WHERE YOU STAND WITH DANCEOS (R13, 9 Sep 2026) — an organization only,
            and on the outside screen rather than inside Studios, because it carries
            the badge and the only door to a person about the decision.

            UNTIL THE DECISION, AND NOT AFTER IT (11 Sep 2026, the user: "after
            verification I don't need this verified organization box — the user
            will create the studio and to make it discoverable he will subscribe,
            then only the studio will be visible"). Once the tick is on the name
            the card has nothing left to say that the studios hub does not say
            better, beside each studio, with its own Subscribe button. The tick
            on the sleeve is the whole verified state; the hub is the next step. ── */}
        {/* ⚠ NO GST CARD ON HOME (11 Sep 2026 — the user: "GST verification step
            is showing here at the org main screen and that['s] stupid; better
            make it one of the options in settings"). It is a ONE-TIME errand,
            and a permanent card for a one-time errand is clutter on the screen
            an organization opens most. It lives at /gst now, reached from
            Settings' own row and from the events desk, which is the only place
            it actually stands in anybody's way. */}
        {/* the conversation with DanceOS, when there is one — the reply is read
            by opening it, and the count says whether there is one to read */}
        {isOrg && thread ? (
          <Link
            href={`/support/${thread.id}`}
            style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: "11px 14px", borderRadius: 16, background: "var(--card)", border: "1px solid var(--el)", color: INK, textDecoration: "none", fontSize: 12.5, fontWeight: 800 }}
          >
            <span aria-hidden="true" style={{ fontSize: 15 }}>💬</span>
            <span style={{ flex: 1, minWidth: 0 }}>{unread > 0 ? `Read DanceOS's reply (${unread})` : "Your conversation with DanceOS"}</span>
            <span aria-hidden="true" style={{ color: "var(--sub)" }}>›</span>
          </Link>
        ) : null}

        {/* ── THE DECK JUST SCROLLS (prototype 7106-7204): today, whole — one list, every side,
            live first — under the one shelf head, with both doors named. An organization
            still waiting on approval sees neither this nor the tools. ── */}
        {orgAwaitingApproval ? null : (
          <TodayShelf
            deck={deck}
            right={
              studio ? (
                /* a studio's doors are its own (7143-7150): the register for what is on now,
                   the calendar for the rest of the week — and the one list of everything it
                   runs, which the app has and the prototype's single-studio world did not need */
                <>
                  <Link href="/managed" aria-label="Everything you manage" style={HEAD_LINK}>
                    Manage
                  </Link>
                  <Link href={`/business/${studio.id}/classes`} aria-label="Classes at this studio" style={HEAD_LINK}>
                    Classes
                  </Link>
                  <Link href={`/business/${studio.id}/calendar`} aria-label="Open the studio calendar" style={HEAD_LINK}>
                    Calendar ›
                  </Link>
                </>
              ) : (
                <>
                  {canManage ? (
                    <Link href="/managed" aria-label="Everything you manage" style={HEAD_LINK}>
                      Manage
                    </Link>
                  ) : null}
                  <Link href="/my-classes" aria-label="All bookings" style={HEAD_LINK}>
                    All bookings ›
                  </Link>
                </>
              )
            }
            emptyTitle={studio ? "Nothing in your rooms today" : "Nothing on today"}
            emptyBody={
              studio
                ? "Every class and event running in this studio’s rooms shows up here on the day."
                : "Classes and events you book, assist on or run today all appear here."
            }
            /* both doors, when both apply (7176-7181) */
            emptyActions={
              <>
                {canManage ? (
                  <Link href="/managed" style={PILL_LIGHT}>
                    See everything you manage
                  </Link>
                ) : null}
                {studio ? (
                  <Link href={`/business/${studio.id}/calendar`} aria-label="Open the studio calendar" style={PILL_DARK}>
                    Open the calendar
                  </Link>
                ) : (
                  <Link href="/my-classes" style={PILL_DARK}>
                    See all bookings
                  </Link>
                )}
              </>
            }
          />
        )}

        {/* ── run your business — the prototype's BizSection (7342-7344, 2497-2583). It is the
            sheet that covers the deck, so it is opaque and it is above. ── */}
        {orgAwaitingApproval ? null : (
          <div style={{ position: "relative", zIndex: 1, background: LILAC }}>
            <BizSection role={profile.role} tenantId={firstTenant} eventsHostId={isOrg ? eventsHostId : null} plan={profile.role === "org" ? null : isArtist ? "active" : "locked"}>
              {/* somebody has asked you onto their team, and only you can answer —
                  the same gold ask the class page wears when a class is handed over */}
              {invites.map((inv) => (
                <Link
                  key={inv.inviteId}
                  href={`/join/${inv.code}`}
                  style={{
                    display: "block",
                    background: CARD,
                    border: `1px solid ${GOLD}66`,
                    borderLeft: `3px solid ${GOLD}`,
                    borderRadius: 16,
                    padding: "13px 14px",
                    marginBottom: 10,
                    color: INK,
                    textDecoration: "none",
                  }}
                >
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 900 }}>
                    {inv.tenantName} wants you on the team
                  </span>
                  <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 3 }}>
                    As {MEMBER_ROLE_WORD[inv.memberRole].toLowerCase()} · you decide
                  </span>
                  <span style={{ display: "block", fontSize: 11.5, fontWeight: 800, color: GOLD, marginTop: 7 }}>
                    Answer this ›
                  </span>
                </Link>
              ))}
            </BizSection>
          </div>
        )}
      </div>
    </div>
  );
}
