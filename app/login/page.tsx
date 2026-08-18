import Link from "next/link";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { BTN_STYLE, DOS_DISPLAY, GOLD, INK, LINE, PINK, SUB } from "@/lib/design/tokens";

/** Welcome screen lifted from the prototype (DanceOSApp.jsx:3700-3724). */
export default function LoginWelcomePage() {
  return (
    <AuthShell>
      <div style={{ fontSize: 17, fontWeight: 800, animation: "dosRise .5s ease both" }}>
        Dance<span style={{ color: PINK }}>OS</span>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 52, fontSize: 15, fontWeight: 800, letterSpacing: 1 }}>
        {["5", "6", "7", "8"].map((n, i) => (
          <span key={n} style={{ animation: `dosBeat 2.4s ease ${i * 0.3}s infinite` }}>
            {n}
            {i < 3 && <span style={{ color: LINE, marginLeft: 14 }}>·</span>}
          </span>
        ))}
      </div>
      <div
        style={{
          fontSize: 46,
          fontWeight: 800,
          lineHeight: 1.06,
          letterSpacing: -1.2,
          margin: "12px 0 16px",
          fontFamily: DOS_DISPLAY,
          animation: "dosRise .6s .1s ease both",
        }}
      >
        The stage
        <br />
        is yours.
      </div>
      <div style={{ fontSize: 15.5, color: SUB, lineHeight: 1.55, marginBottom: 26, animation: "dosRise .6s .2s ease both" }}>
        DanceOS is where India dances — find classes near you, run your studio, build your crew, and get paid
        to do what you love.
      </div>
      <div style={{ display: "flex", gap: 10, animation: "dosRise .6s .3s ease both" }}>
        <Link
          href="/login/phone"
          style={{
            ...BTN_STYLE,
            flex: 1.25,
            background: "#FAFAFA",
            color: "#0A0A0A",
            fontWeight: 900,
            boxShadow: "0 8px 22px rgba(236,72,153,.28)",
            textDecoration: "none",
          }}
        >
          Start dancing
        </Link>
        <Link
          href="/login/phone"
          style={{
            ...BTN_STYLE,
            flex: 1,
            background: "rgba(255,255,255,.07)",
            color: INK,
            border: `1.5px solid ${LINE}`,
            textDecoration: "none",
          }}
        >
          Sign in
        </Link>
      </div>
      <div style={{ display: "flex", gap: 7, margin: "30px 0 0", animation: "dosRise .6s .4s ease both" }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 5,
              borderRadius: 3,
              background: i === 7 ? GOLD : PINK,
              animation: `dosDash 2.4s ease ${i * 0.3}s infinite`,
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background: "#0E0A14",
          padding: "26px 22px calc(30px + env(safe-area-inset-bottom))",
          color: "#B7AECB",
          fontSize: 12.5,
          letterSpacing: 2.6,
          lineHeight: 2.3,
          fontWeight: 800,
        }}
      >
        LEARN <span style={{ color: PINK }}>·</span> TEACH <span style={{ color: PINK }}>·</span> CONNECT
        <br />
        PERFORM <span style={{ color: PINK }}>·</span> EARN <span style={{ color: PINK }}>·</span> GROW
      </div>
      <div style={{ height: 150 }} />
    </AuthShell>
  );
}
