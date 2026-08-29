import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";
import { findMyEnrollments } from "@/repositories/enrollments";
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
import type { MyEnrollment } from "@/types/enrollment";
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
const greeting = (): string => {
  const hr = Number(
    new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: IST }).format(new Date())
  );
  return hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
};

const fmtSession = (iso: string): string =>
  `${new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: IST }).format(
    new Date(iso)
  )} · ${new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST })
    .format(new Date(iso))
    .toLowerCase()}`;

/** the IST calendar day a moment falls on — "2026-08-28" */
const dayKey = (d: Date): string =>
  new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: IST }).format(d);

/** The deck's slice of today: the next few live bookings, live-now ones flagged. */
const selectUpcoming = (
  enrollments: MyEnrollment[]
): { upcoming: MyEnrollment[]; liveIds: Set<string>; todayN: number } => {
  const now = Date.now();
  const upcoming = enrollments
    .filter((e) => e.status !== "cancelled" && new Date(e.endsAt).getTime() >= now)
    .slice(0, 4);
  const liveIds = new Set(
    upcoming.filter((e) => new Date(e.startsAt).getTime() <= now).map((e) => e.id)
  );
  const today = dayKey(new Date(now));
  const todayN = upcoming.filter((e) => dayKey(new Date(e.startsAt)) === today).length;
  return { upcoming, liveIds, todayN };
};

/** Home — the dancer dashboard lifted from prototype S_homedancer (DanceOSApp.jsx:7206-7352):
 *  the identity sleeve with the time-of-day greeting, the deck of booked sessions under
 *  "Today's schedule" with a live-now chip, and the Artist Tools grid (BizSection). The full
 *  PassDeck (QR codes, invoices, share) arrives with later slices — see the UI parity backlog. */
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

  const [enrollments, tenants, invites, plan] = await Promise.all([
    findMyEnrollments(supabase),
    findMyTenants(supabase),
    // somebody asked you onto their team — matched on the address you sign in
    // with, so an invite arrives here without any link being passed around
    findMyPendingInvites(supabase),
    profile.role === "studio" ? Promise.resolve(null) : findMyArtistPlan(supabase),
  ]);

  const { upcoming, liveIds, todayN } = selectUpcoming(enrollments);

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
                  {greeting().toUpperCase()}
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

        {/* ── the deck of today: your booked sessions, live ones flagged (prototype PassDeck 7139-7200) ── */}
        <div data-dosfold="deck" style={{ margin: "10px -16px 14px", padding: "0 16px" }}>
          <DosShelfHead
            pad="2px 0 8px"
            right={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                {canManage ? (
                  <Link href="/managed" aria-label="Everything you manage" style={{ color: PINK, fontWeight: 800, cursor: "pointer", textDecoration: "none" }}>
                    Manage
                  </Link>
                ) : null}
                <Link href="/my-classes" aria-label="All bookings" style={{ color: PINK, fontWeight: 800, cursor: "pointer", textDecoration: "none" }}>
                  All bookings ›
                </Link>
              </span>
            }
          >
            Today’s schedule
            <span style={{ ...HOME_TYPE.meta, color: SUB, marginLeft: 8 }}>{todayN} today</span>
          </DosShelfHead>

          {upcoming.length === 0 ? (
            <div style={{ background: CARD, border: `1.5px dashed ${LINE}`, borderRadius: 16, padding: "16px", textAlign: "center" }}>
              <div style={{ fontSize: 12.5, fontWeight: 900 }}>Nothing on today</div>
              <div style={{ fontSize: 10.5, color: SUB, marginTop: 3 }}>
                Classes and events you book, assist on or run today all appear here.
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10, flexWrap: "wrap" }}>
                {canManage ? (
                  <Link
                    href="/managed"
                    style={{ display: "inline-block", padding: "9px 18px", borderRadius: 999, background: CARD, border: `1px solid ${LINE}`, fontWeight: 900, fontSize: 11.5, cursor: "pointer", color: INK, textDecoration: "none" }}
                  >
                    See everything you manage
                  </Link>
                ) : null}
                <Link
                  href="/my-classes"
                  style={{ display: "inline-block", padding: "9px 18px", borderRadius: 999, background: INK, color: SOLID, fontWeight: 900, fontSize: 11.5, cursor: "pointer", textDecoration: "none" }}
                >
                  See all bookings
                </Link>
              </div>
            </div>
          ) : (
            upcoming.map((e) => {
              const live = liveIds.has(e.id);
              const col = dosStyleColor(e.style);
              return (
                <Link
                  key={e.id}
                  href={`/c/${e.shareSlug}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: CARD,
                    border: `1px solid ${live ? `${col}88` : LINE}`,
                    borderRadius: 18,
                    padding: "13px 14px",
                    marginBottom: 10,
                    color: INK,
                    textDecoration: "none",
                  }}
                >
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      flexShrink: 0,
                      borderRadius: 12,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: `linear-gradient(150deg, ${col}, ${col}88)`,
                      color: "#fff",
                      fontSize: 17,
                      fontWeight: 900,
                      fontFamily: DOS_DISPLAY,
                    }}
                  >
                    {e.style.slice(0, 1)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 14,
                        fontWeight: 900,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {e.style} — {e.title}
                    </span>
                    <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: SUB, marginTop: 3 }}>
                      {e.tenantName} · {fmtSession(e.startsAt)}
                      {e.status === "waitlisted" ? " · waitlist" : ""}
                    </span>
                  </span>
                  {live && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        flexShrink: 0,
                        fontSize: 10,
                        fontWeight: 900,
                        letterSpacing: 0.8,
                        color: "#22C55E",
                      }}
                    >
                      <span style={{ position: "relative", width: 7, height: 7 }}>
                        <span
                          style={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: 99,
                            background: "#22C55E",
                            animation: "dosPulseH 1.4s ease-out infinite",
                          }}
                        />
                        <span style={{ position: "absolute", inset: 0, borderRadius: 99, background: "#22C55E" }} />
                      </span>
                      LIVE
                    </span>
                  )}
                </Link>
              );
            })
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
