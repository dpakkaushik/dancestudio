import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";
import { signOutAction } from "@/features/auth/server-actions/auth";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, LINE, RED, SUB } from "@/lib/design/tokens";
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
      {/* identity header — treatment lifted from the prototype's Home sleeve (DanceOSApp.jsx:7248-7339) */}
      <div
        style={{
          background: `linear-gradient(180deg, ${RC}9e 0%, ${RC}4a 46%, ${RC}14 74%, ${LILAC} 100%)`,
          padding: "34px 22px 26px",
        }}
      >
        <div
          style={{
            width: 86,
            height: 86,
            borderRadius: 0,
            background: `linear-gradient(150deg, ${RG[0]}, ${RG[1]})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            fontWeight: 900,
            fontFamily: DOS_DISPLAY,
            color: "#0A0A0A",
            boxShadow: "0 0 34px 10px rgba(0,0,0,.28), 0 14px 30px -6px rgba(0,0,0,.6)",
          }}
        >
          {initials(profile.fullName)}
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: "rgba(255,255,255,.9)", marginTop: 18 }}>
          WELCOME BACK
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, fontFamily: DOS_DISPLAY, letterSpacing: -0.8, marginTop: 4 }}>
          {profile.fullName}
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: SUB, marginTop: 6 }}>
          {ROLE_WORD[profile.role]}
          {profile.city ? ` · ${profile.city}` : ""}
        </div>
      </div>

      <div style={{ padding: "10px 22px 40px" }}>
        <div style={{ fontSize: 13.5, color: SUB, lineHeight: 1.6, marginBottom: 24 }}>
          You&apos;re signed in with a real account on a real database. Classes, discovery, and the rest of
          the app arrive step by step from the prototype.
        </div>
        <Link
          href="/business"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255,255,255,.07)",
            border: `1px solid ${LINE}`,
            borderLeft: "4px solid #3B82F6",
            borderRadius: 16,
            padding: "14px 15px",
            marginBottom: 24,
            color: INK,
            textDecoration: "none",
            fontSize: 13.5,
            fontWeight: 900,
          }}
        >
          Your businesses — studios & trainer setups
          <span style={{ color: "#3B82F6", fontWeight: 800, fontSize: 12 }}>Open ›</span>
        </Link>
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
