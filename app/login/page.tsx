import Link from "next/link";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { BTN_STYLE, DOS_DISPLAY, GOLD, INK, LINE, PINK, SUB } from "@/lib/design/tokens";

/** Welcome screen, from the prototype (DanceOSApp.jsx:3700-3724) with three
 *  deliberate departures, all logged under "Deliberate deviations from the
 *  prototype" and all consequences of auth being email + password:
 *
 *  1. THE TWO BUTTONS NOW GO TO DIFFERENT PLACES. In the prototype both called
 *     setStep("signin") — one destination, because its model was passwordless
 *     and joining and returning were the same act. With passwords they are not:
 *     "Start dancing" creates an account, "Sign in" proves an existing one.
 *  2. THEY STACK RATHER THAN SIT SIDE BY SIDE. Two 50%-width buttons at the
 *     bottom of a phone read as equal choices; these are not equal — most
 *     people arriving here are new. Full width, primary first.
 *  3. The footer band is a real flex child, not `position:absolute` paired with
 *     a 150px spacer. The prototype's version left a dead void between the
 *     dashes and the band on a tall phone; `flex-1` absorbs the slack and drops
 *     the buttons into thumb reach.
 *
 *  The tagline is the user's, replacing the prototype's longer one.
 */
export default function LoginWelcomePage() {
  return (
    <AuthShell>
      <div style={{ fontSize: 17, fontWeight: 800, animation: "dosRise .5s ease both" }}>
        Dance<span style={{ color: PINK }}>OS</span>
      </div>
      {/* The slack is SPLIT rather than all dumped below the hero: roughly a
          third above, two thirds below. All of it in one place left the headline
          jammed under the logo with a crater beneath it — which is the same
          "unfinished screen" read as having no spacer at all, just relocated. */}
      <div style={{ flex: 0.5, minHeight: 18 }} />

      <div style={{ display: "flex", gap: 14, marginTop: 34, fontSize: 15, fontWeight: 800, letterSpacing: 1 }}>
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
      <div
        style={{
          fontSize: 16.5,
          color: SUB,
          lineHeight: 1.5,
          fontWeight: 600,
          animation: "dosRise .6s .2s ease both",
        }}
      >
        Find classes. Build your crew.
        <br />
        Get paid to dance.
      </div>

      {/* absorbs the slack on a tall screen instead of leaving a void above the band */}
      <div style={{ flex: 1, minHeight: 28 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "dosRise .6s .3s ease both" }}>
        <Link
          href="/login/signup"
          style={{
            ...BTN_STYLE,
            /* an <a> is inline by default, so BTN_STYLE's width and padding need
               a block box to land on; its textAlign then centres the label */
            display: "block",
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
          href="/login/email"
          style={{
            ...BTN_STYLE,
            display: "block",
            background: "var(--card)",
            color: INK,
            border: `1.5px solid ${LINE}`,
            textDecoration: "none",
          }}
        >
          Sign in
        </Link>
        <p style={{ marginTop: 2, fontSize: 12.5, color: SUB, textAlign: "center", lineHeight: 1.5 }}>
          New here? Start dancing takes a minute.
        </p>
      </div>

      <div style={{ display: "flex", gap: 7, margin: "24px 0 0", animation: "dosRise .6s .4s ease both" }}>
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

      {/* full-bleed: cancels AuthShell's 22px gutters and its bottom safe-area pad,
          then re-applies its own so the band reaches the true bottom edge */}
      <div
        style={{
          marginLeft: -22,
          marginRight: -22,
          marginTop: 24,
          marginBottom: "calc(-2.5rem - env(safe-area-inset-bottom))",
          background: "#0E0A14",
          padding: "20px 22px calc(22px + env(safe-area-inset-bottom))",
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
    </AuthShell>
  );
}
