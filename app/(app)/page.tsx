import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";
import { findMyDeck, findStudioDeck } from "@/repositories/home";
import { findMyPendingInvites } from "@/repositories/invites";
import { findMyTenants } from "@/repositories/tenants";
import { findMyArtistPlan } from "@/repositories/plans";
import { ProfileShare } from "@/features/profiles/components/ProfileShare";
import { VerifiedTick } from "@/features/settings/components/settings-kit";
import { DosStyleTile } from "@/features/discovery/components/DiscoverFilters";
import { dosStyleColor } from "@/lib/constants/styles";
import { photoUrl } from "@/lib/media/photo";
import { CARD, DOS_DISPLAY, DOS_UI, GOLD, INK, LILAC, LINE, MUTED, PINK, SOLID, SUB } from "@/lib/design/tokens";
import { BizSection, DosShelfHead, HOME_TYPE } from "@/features/home/components/home-kit";
import { PassDeck } from "@/features/home/components/PassDeck";
import { memberNoWords, type ProfileRole } from "@/types/profile";
import { MEMBER_ROLE_WORD } from "@/types/staff";

/** Metal rings per role — prototype DOS_RINGS (DanceOSApp.jsx:1462-1463). */
const DOS_RINGS: Record<ProfileRole, string[]> = {
  studio: ["#F9E27D", "#B8860B", "#FFF6D5", "#D4AF37"],
  trainer: ["#F2F2F2", "#8E9BAE", "#FFFFFF", "#C0C0C0"],
  dancer: ["#F0BC8A", "#8C5A2B", "#F7DDBC", "#CD7F32"],
};

const ROLE_WORD: Record<ProfileRole, string> = {
  dancer: "Dancer",
  trainer: "Artist",
  studio: "Studio",
};

const IST = "Asia/Kolkata";

const initials = (name: string): string =>
  (name.match(/\b\w/g) || ["D"]).slice(0, 2).join("").toUpperCase();

/** Time-of-day greeting — prototype Home (DanceOSApp.jsx:7212-7213), on the IST clock. */
const greeting = (now: Date): string => {
  const hr = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: IST }).format(now));
  return hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
};

const headLink = { color: PINK, fontWeight: 800, cursor: "pointer", textDecoration: "none" } as const;
const pillDark = { display: "inline-block", padding: "9px 18px", borderRadius: 999, background: INK, color: SOLID, fontWeight: 900, fontSize: 11.5, cursor: "pointer", textDecoration: "none" } as const;
const pillLight = { display: "inline-block", padding: "9px 18px", borderRadius: 999, background: CARD, border: `1px solid ${LINE}`, fontWeight: 900, fontSize: 11.5, cursor: "pointer", color: INK, textDecoration: "none" } as const;

/** Home — the dancer dashboard lifted from prototype S_homedancer (DanceOSApp.jsx:7206-7352):
 *  the identity sleeve with the time-of-day greeting, the PassDeck of today under
 *  "Today's schedule" (6863-7204 — one swiped rail of the app's own cards, the role chip,
 *  one Live badge, the QR and the invoice on a booked card), and the Artist Tools grid
 *  (BizSection). A studio's Home asks the deck the studio's question — what is running
 *  in its rooms — with its own doors (7022-7060, 7139-7150). */
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
    redirect("/onboarding");
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const [tenants, invites, plan] = await Promise.all([
    findMyTenants(supabase),
    // somebody asked you onto their team — matched on the address you sign in
    // with, so an invite arrives here without any link being passed around
    findMyPendingInvites(supabase),
    profile.role === "studio" ? Promise.resolve(null) : findMyArtistPlan(supabase),
  ]);

  /* a studio's day is not a person's day (7022-7060): a studio owner's Home shows
     what is running in the studio's rooms, drawn by the same card in the same rail */
  const studio = profile.role === "studio" && tenants.length > 0 ? tenants[0] : null;
  const deck = studio ? await findStudioDeck(supabase, studio, nowIso) : await findMyDeck(supabase, user.id, nowIso, tenants);

  const RG = DOS_RINGS[profile.role];
  const RC = RG[3];
  const face = photoUrl(profile.avatarPath);
  /* "24, New Delhi" — one string with a comma, the way you'd introduce somebody (7295-7306) */
  const place = profile.city ?? "";
  const metaLine = [profile.age != null ? String(profile.age) : "", place].filter(Boolean).join(", ");
  /* Manage only appears if you actually run something (7135): the door to what you
     manage, and offering it to somebody who manages nothing is a door onto an empty room */
  const canManage = tenants.length > 0;
  const firstTenant = tenants[0]?.id ?? null;

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
        {/* identity sleeve — the same object the profile wears (prototype 7248-7339) */}
        <div
          style={{
            position: "relative",
            margin: "0 -16px",
            overflow: "hidden",
            background: `linear-gradient(180deg, ${RC}9e 0%, ${RC}4a 46%, ${RC}14 74%, ${LILAC} 100%)`,
          }}
        >
          <div style={{ padding: "16px 16px 12px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 14, minWidth: 0 }}>
              {/* the picture is square and sharp, with the sleeve's thrown shadow — the same
                  object the profile puts at the top of itself (7276-7283) */}
              <Link
                href="/profile"
                aria-label="Open your profile"
                style={{
                  width: 86,
                  height: 86,
                  flexShrink: 0,
                  borderRadius: 0,
                  overflow: "hidden",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: `linear-gradient(150deg, ${RG[0]}, ${RG[1]})`,
                  color: "#fff",
                  fontSize: 32,
                  fontWeight: 900,
                  letterSpacing: 1,
                  fontFamily: DOS_DISPLAY,
                  textDecoration: "none",
                  boxShadow: "0 0 34px 10px rgba(0,0,0,.28), 0 14px 30px -6px rgba(0,0,0,.6)",
                }}
              >
                {face ? (
                  <Image src={face} alt="" width={86} height={86} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  initials(profile.fullName)
                )}
              </Link>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...HOME_TYPE.micro, letterSpacing: 2, color: "rgba(255,255,255,.9)" }}>
                  {greeting(now).toUpperCase()}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, marginTop: 4 }}>
                  <span
                    style={{
                      minWidth: 0,
                      fontSize: 24,
                      fontWeight: 900,
                      fontFamily: DOS_DISPLAY,
                      letterSpacing: -0.8,
                      lineHeight: 1.08,
                      color: INK,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {profile.fullName}
                  </span>
                  {/* the tick is DanceOS's to give (7292) — set when a verification actually clears */}
                  {profile.verifiedAt ? <VerifiedTick size={16} /> : null}
                  {/* the QR beside the name shares this person (7288) */}
                  <ProfileShare path={`/person/${profile.id}`} name={profile.fullName} />
                </div>
                {metaLine ? (
                  <div style={{ display: "flex", alignItems: "center", marginTop: 5, minWidth: 0, fontSize: 13, fontWeight: 800, color: INK }}>
                    {place ? (
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(place)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open this address in Maps"
                        style={{
                          minWidth: 0,
                          cursor: "pointer",
                          fontVariantNumeric: "tabular-nums",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: "inherit",
                          textDecoration: "none",
                        }}
                      >
                        {metaLine}
                      </a>
                    ) : (
                      <span style={{ minWidth: 0, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {metaLine}
                      </span>
                    )}
                  </div>
                ) : null}
                {/* the styles you dance, as the app's one style tile (7330, DosStyleRow) */}
                {profile.styles.length ? (
                  <div style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", marginTop: 8, alignItems: "center" }}>
                    {profile.styles.map((s) => (
                      <DosStyleTile key={s} label={s} color={dosStyleColor(s)} aria={`${s} — a style you dance`} small />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {/* what you are, not what your number is (7308-7323): the role is the word,
                the account number the small line under it */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 22, marginTop: 12, flexWrap: "wrap" }}>
              <Link href="/profile" aria-label="Open your profile" style={{ textDecoration: "none", color: INK }}>
                <span style={{ display: "block", fontSize: 20, fontWeight: 900, lineHeight: 1, letterSpacing: -0.5, fontFamily: DOS_DISPLAY, color: INK }}>
                  {ROLE_WORD[profile.role]}
                </span>
                {profile.memberNo != null ? (
                  <span style={{ display: "block", ...HOME_TYPE.micro, color: MUTED, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                    {memberNoWords(profile.memberNo)}
                  </span>
                ) : null}
              </Link>
            </div>
          </div>
        </div>

        {/* ── THE DECK JUST SCROLLS (prototype 7106-7204): today, whole — one list, every side,
            live first — under the one shelf head, with both doors named. The wrapper runs the
            full width so the swiped rail, which reaches past the page's padding, is not clipped. ── */}
        <div data-dosfold="deck" style={{ margin: "10px -16px 14px", padding: "0 16px" }}>
          <DosShelfHead
            pad="2px 0 8px"
            right={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                {studio ? (
                  /* a studio's doors are its own (7143-7150): the register for what is on now,
                     the calendar for the rest of the week — and the one list of everything it
                     runs, which the app has and the prototype's single-studio world did not need */
                  <>
                    <Link href="/managed" aria-label="Everything you manage" style={headLink}>
                      Manage
                    </Link>
                    <Link href={`/business/${studio.id}/classes`} aria-label="Classes at this studio" style={headLink}>
                      Classes
                    </Link>
                    <Link href={`/business/${studio.id}/calendar`} aria-label="Open the studio calendar" style={headLink}>
                      Calendar ›
                    </Link>
                  </>
                ) : (
                  <>
                    {canManage ? (
                      <Link href="/managed" aria-label="Everything you manage" style={headLink}>
                        Manage
                      </Link>
                    ) : null}
                    <Link href="/my-classes" aria-label="All bookings" style={headLink}>
                      All bookings ›
                    </Link>
                  </>
                )}
              </span>
            }
          >
            Today’s schedule
            <span style={{ ...HOME_TYPE.meta, color: SUB, marginLeft: 8 }}>{deck.length} today</span>
          </DosShelfHead>

          {deck.length === 0 ? (
            <div style={{ background: CARD, border: `1.5px dashed ${LINE}`, borderRadius: 16, padding: "16px", textAlign: "center" }}>
              <div style={{ fontSize: 12.5, fontWeight: 900 }}>{studio ? "Nothing in your rooms today" : "Nothing on today"}</div>
              <div style={{ fontSize: 10.5, color: SUB, marginTop: 3 }}>
                {studio
                  ? "Every class and event running in this studio’s rooms shows up here on the day."
                  : "Classes and events you book, assist on or run today all appear here."}
              </div>
              {/* both doors, when both apply (7176-7181) */}
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10, flexWrap: "wrap" }}>
                {canManage ? (
                  <Link href="/managed" style={pillLight}>
                    See everything you manage
                  </Link>
                ) : null}
                {studio ? (
                  <Link href={`/business/${studio.id}/calendar`} aria-label="Open the studio calendar" style={pillDark}>
                    Open the calendar
                  </Link>
                ) : (
                  <Link href="/my-classes" style={pillDark}>
                    See all bookings
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <PassDeck items={deck} />
          )}
        </div>

        {/* ── run your business — the prototype's BizSection (7342-7344, 2497-2583). It is the
            sheet that covers the deck, so it is opaque and it is above. ── */}
        <div style={{ position: "relative", zIndex: 1, background: LILAC }}>
          <BizSection role={profile.role} tenantId={firstTenant} plan={profile.role === "studio" ? null : plan?.active ? "active" : "locked"}>
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
      </div>
    </div>
  );
}
