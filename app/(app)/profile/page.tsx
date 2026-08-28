import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { publicProfilePath } from "@/lib/routes/publicProfile";
import { findMyFollowing } from "@/repositories/follows";
import { findProfileById } from "@/repositories/profiles";
import { signOutAction } from "@/features/auth/server-actions/auth";
import { CARD, DOS_DISPLAY, DOS_TINT, DOS_UI, INK, LILAC, LINE, RED, SUB } from "@/lib/design/tokens";
import type { ProfileRole } from "@/types/profile";

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

const initials = (name: string): string =>
  (name.match(/\b\w/g) || ["D"]).slice(0, 2).join("").toUpperCase();

/** Profile tab — the identity kit shared with Home (prototype: "the ring, the meta row
 *  and the rank are one kit… both screens ask it the same question", 7230-7238), plus
 *  sign-out. The full S_profiletab (stats, achievements, settings) arrives with later
 *  slices — see the UI parity backlog. */
export default async function ProfilePage() {
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
  /* the businesses you follow — the prototype's Following figure and sheet
     (10714, 11336), as a list on the page until the sheet arrives */
  const following = await findMyFollowing(supabase);

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
      <div
        style={{
          background: `linear-gradient(180deg, ${RC}9e 0%, ${RC}4a 46%, ${RC}14 74%, ${LILAC} 100%)`,
          padding: "24px 16px 16px",
        }}
      >
        <div
          style={{
            width: 86,
            height: 86,
            borderRadius: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `linear-gradient(150deg, ${RG[0]}, ${RG[1]})`,
            color: "#0A0A0A",
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: 1,
            fontFamily: DOS_DISPLAY,
            boxShadow: "0 0 34px 10px rgba(0,0,0,.28), 0 14px 30px -6px rgba(0,0,0,.6)",
          }}
        >
          {initials(profile.fullName)}
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, fontFamily: DOS_DISPLAY, letterSpacing: -0.8, marginTop: 14 }}>
          {profile.fullName}
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: SUB, marginTop: 6 }}>
          {ROLE_WORD[profile.role]}
          {profile.city ? ` · ${profile.city}` : ""}
        </div>
      </div>

      <div style={{ padding: "10px 16px 24px" }}>
        {/* the figure, set like a figure (prototype 10706-10716) */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 22, marginBottom: 14 }}>
          <span aria-label={`${following.length} following`}>
            <span style={{ display: "block", fontSize: 22, fontWeight: 900, lineHeight: 1, letterSpacing: -0.6, fontFamily: DOS_DISPLAY, fontVariantNumeric: "tabular-nums" }}>
              {following.length}
            </span>
            <span style={{ display: "block", fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--muted)", marginTop: 4 }}>
              Following
            </span>
          </span>
        </div>
        {following.length > 0 ? (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.4, color: SUB, padding: "0 0 8px" }}>FOLLOWING</div>
            {following.map((f) => {
              const tint = f.tenantType === "studio" ? DOS_TINT.studio : DOS_TINT.trainer;
              return (
                <Link
                  key={f.followId}
                  href={publicProfilePath({ id: f.tenantId, type: f.tenantType })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    background: CARD,
                    border: `1px solid ${LINE}`,
                    borderLeft: `4px solid ${tint}`,
                    borderRadius: 16,
                    padding: "12px 15px",
                    marginBottom: 8,
                    color: INK,
                    textDecoration: "none",
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.tenantName}
                    </span>
                    <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: SUB, marginTop: 3 }}>
                      {f.tenantType === "studio" ? "Studio" : "Artist"}
                      {f.tenantCity ? ` · ${f.tenantCity}` : ""}
                    </span>
                  </span>
                  <span style={{ color: tint, fontWeight: 800, fontSize: 12, flexShrink: 0 }}>Open ›</span>
                </Link>
              );
            })}
          </div>
        ) : null}
        <div style={{ fontSize: 12.5, color: SUB, lineHeight: 1.6, marginBottom: 18 }}>
          Followers, achievements, reviews and your full dance record arrive with the community
          slices — this page grows into the prototype&apos;s profile step by step.
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            style={{
              padding: "13px 22px",
              borderRadius: 999,
              fontWeight: 800,
              fontSize: 14,
              cursor: "pointer",
              background: "transparent",
              color: RED,
              border: `1.5px solid ${LINE}`,
            }}
          >
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}
