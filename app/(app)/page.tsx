import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";
import { findMyEnrollments } from "@/repositories/enrollments";
import { findMyPendingInvites } from "@/repositories/invites";
import { findMyTenants } from "@/repositories/tenants";
import { dosStyleColor } from "@/lib/constants/styles";
import { CARD, DOS_DISPLAY, DOS_TINT, DOS_UI, GOLD, INK, LILAC, LINE, SUB } from "@/lib/design/tokens";
import type { MyEnrollment } from "@/types/enrollment";
import type { ProfileRole } from "@/types/profile";
import type { Tenant } from "@/types/tenant";
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

const TENANT_WORD: Record<Tenant["type"], string> = {
  studio: "Studio",
  trainer_business: "Artist business",
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

/** The deck's slice of today: the next few live bookings, live-now ones flagged. */
const selectUpcoming = (
  enrollments: MyEnrollment[]
): { upcoming: MyEnrollment[]; liveIds: Set<string> } => {
  const now = Date.now();
  const upcoming = enrollments
    .filter((e) => e.status !== "cancelled" && new Date(e.endsAt).getTime() >= now)
    .slice(0, 4);
  const liveIds = new Set(
    upcoming.filter((e) => new Date(e.startsAt).getTime() <= now).map((e) => e.id)
  );
  return { upcoming, liveIds };
};

/** Home — the dancer dashboard lifted from prototype S_homedancer (DanceOSApp.jsx:7206-7352):
 *  the identity sleeve with the time-of-day greeting, the deck of booked sessions with a
 *  live-now chip, and the run-your-business section. The full PassDeck (QR codes, invoices,
 *  share) arrives with later slices — see the UI parity backlog. */
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

  const [enrollments, tenants, invites] = await Promise.all([
    findMyEnrollments(supabase),
    findMyTenants(supabase),
    // somebody asked you onto their team — matched on the address you sign in
    // with, so an invite arrives here without any link being passed around
    findMyPendingInvites(supabase),
  ]);

  const { upcoming, liveIds } = selectUpcoming(enrollments);

  const RG = DOS_RINGS[profile.role];
  const RC = RG[3];

  return (
    <div
      style={{
        background: LILAC,
        minHeight: "100vh",
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        boxSizing: "border-box",
      }}
    >
      {/* identity sleeve — the same object the profile wears (prototype 7248-7339) */}
      <div
        style={{
          background: `linear-gradient(180deg, ${RC}9e 0%, ${RC}4a 46%, ${RC}14 74%, ${LILAC} 100%)`,
          padding: "16px 16px 12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, minWidth: 0 }}>
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
              color: "#0A0A0A",
              fontSize: 32,
              fontWeight: 900,
              letterSpacing: 1,
              fontFamily: DOS_DISPLAY,
              textDecoration: "none",
              boxShadow: "0 0 34px 10px rgba(0,0,0,.28), 0 14px 30px -6px rgba(0,0,0,.6)",
            }}
          >
            {initials(profile.fullName)}
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: "rgba(255,255,255,.9)" }}>
              {greeting().toUpperCase()}
            </div>
            <div
              style={{
                minWidth: 0,
                fontSize: 24,
                fontWeight: 900,
                fontFamily: DOS_DISPLAY,
                letterSpacing: -0.8,
                lineHeight: 1.08,
                marginTop: 4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {profile.fullName}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: INK, marginTop: 5 }}>
              {profile.city ?? ""}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <span style={{ display: "block", fontSize: 20, fontWeight: 900, lineHeight: 1, letterSpacing: -0.5, fontFamily: DOS_DISPLAY }}>
            {ROLE_WORD[profile.role]}
          </span>
        </div>
      </div>

      <div style={{ padding: "12px 16px 24px" }}>
        {/* ── the deck of today: your booked sessions, live ones flagged (prototype PassDeck) ── */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            padding: "6px 0 8px",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.4, color: SUB }}>YOUR CLASSES</div>
          <Link href="/my-classes" style={{ fontSize: 11.5, fontWeight: 800, color: "#5AC8FA", textDecoration: "none" }}>
            See all ›
          </Link>
        </div>
        {upcoming.map((e) => {
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
        })}
        {upcoming.length === 0 && (
          <Link
            href="/classes"
            style={{
              display: "block",
              textAlign: "center",
              padding: "22px 20px",
              color: SUB,
              border: `1.5px dashed ${LINE}`,
              borderRadius: 18,
              fontSize: 13,
              marginBottom: 10,
              textDecoration: "none",
            }}
          >
            Nothing booked yet — <b style={{ color: "#5AC8FA" }}>find a class ›</b>
          </Link>
        )}

        {/* ── run your business (prototype BizSection, 7342-7344) ── */}
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.4, color: SUB, padding: "16px 0 8px" }}>
          RUN YOUR BUSINESS
        </div>

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

        {tenants.map((t) => {
          const tint = t.type === "studio" ? DOS_TINT.studio : DOS_TINT.trainer;
          return (
            <Link
              key={t.id}
              href={`/business/${t.id}/classes`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                background: CARD,
                border: `1px solid ${LINE}`,
                borderLeft: `4px solid ${tint}`,
                borderRadius: 16,
                padding: "14px 15px",
                marginBottom: 10,
                color: INK,
                textDecoration: "none",
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontSize: 13.5,
                    fontWeight: 900,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.name}
                </span>
                <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: SUB, marginTop: 3 }}>
                  {TENANT_WORD[t.type]}
                  {t.area ? ` · ${t.area}` : ""}
                  {t.city ? ` · ${t.city}` : ""}
                </span>
              </span>
              <span style={{ color: tint, fontWeight: 800, fontSize: 12, flexShrink: 0 }}>Manage ›</span>
            </Link>
          );
        })}
        <Link
          href="/business"
          style={{
            display: "block",
            textAlign: "center",
            padding: "14px 15px",
            border: `1.5px dashed ${LINE}`,
            borderRadius: 16,
            color: SUB,
            fontSize: 12.5,
            fontWeight: 800,
            textDecoration: "none",
            marginBottom: 10,
          }}
        >
          {tenants.length === 0 ? "＋ Set up a studio or artist business" : "＋ Add another business"}
        </Link>

        {/* ── discover row ── */}
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.4, color: SUB, padding: "16px 0 8px" }}>
          FIND YOUR NEXT CLASS
        </div>
        <Link
          href="/discover"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: CARD,
            border: `1px solid ${LINE}`,
            borderLeft: "4px solid #5AC8FA",
            borderRadius: 16,
            padding: "14px 15px",
            color: INK,
            textDecoration: "none",
            fontSize: 13.5,
            fontWeight: 900,
          }}
        >
          Discover — classes & studios near you
          <span style={{ color: "#5AC8FA", fontWeight: 800, fontSize: 12 }}>Open ›</span>
        </Link>
      </div>
    </div>
  );
}
