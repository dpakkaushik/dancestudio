import Link from "next/link";
import { DosMark } from "@/components/ui/DosMark";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { leaveIfSignedIn } from "@/lib/auth/leaveIfSignedIn";
import { BTN_STYLE, DOS_DISPLAY, GOLD, INK, LINE, SKY, SUB } from "@/lib/design/tokens";

/** Welcome screen, from the prototype (DanceOSApp.jsx:3700-3724) with three
 *  deliberate departures, all logged under "Deliberate deviations from the
 *  prototype" and all consequences of auth being email + password:
 *
 *  1. THE TWO BUTTONS NOW GO TO DIFFERENT PLACES. In the prototype both called
 *     setStep("signin") — one destination, because its model was passwordless
 *     and joining and returning were the same act. With passwords they are not:
 *     "Start Dancing" creates an account, "Log In" proves an existing one.
 *     ⚠ THE WORDS (18 Sep 2026, the user): "sign in should be called Log In,
 *     because Start Dancing is Sign In technically" — a new account is signing
 *     in for the first time, so "Sign in" on the second button was a second
 *     name for the same thing the first one does. And the D is a capital: both
 *     buttons are titles, so both are title-cased. Deviation row A9.
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
export default async function LoginWelcomePage({ searchParams }: { searchParams: Promise<{ left?: string }> }) {
  await leaveIfSignedIn();
  /* AN ACCOUNT CLOSED FROM SETTINGS LANDS HERE (6 Oct 2026, decision 6) — said
     once, so the person is not left wondering whether the press did anything */
  const left = (await searchParams).left === "1";
  return (
    <AuthShell>
      {left ? (
        <div role="status" data-testid="account-closed" style={{ marginTop: 12, padding: "11px 13px", borderRadius: 14, border: `1.5px solid ${LINE}`, background: "var(--card)", fontSize: 12.5, lineHeight: 1.5, color: SUB }}>
          <b style={{ color: INK }}>Your account is closed.</b> DanceOS will erase it and reply to your address — you cannot sign in to it meanwhile.
        </div>
      ) : null}
      {/* ⚠ THE FIRST PAGE, REVAMPED ABOVE THE BUTTONS (3 Oct 2026, the user:
          "dance os logo on start screen page in the centre. Dance First, Think
          Later! also there above start dancing and login revamp the first page
          above the buttons", then "5678 bigger"). The wordmark used to sit in
          the top-left corner at 17px over a left-aligned headline; now the MARK
          is the centre of the screen with the wordmark under it, the count-in is
          a display figure rather than a caption, and the headline and its line
          are centred beneath. The slack splits around the block so it sits at
          the optical middle on a tall phone and closes up on a short one. */}
      <div style={{ flex: 1, minHeight: 14 }} />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ position: "relative", animation: "dosRise .5s ease both" }}>
          {/* a soft glow behind the mark, in its own three colours */}
          <span aria-hidden="true" style={{ position: "absolute", inset: -28, borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,.32), rgba(236,72,153,.14) 45%, transparent 70%)", filter: "blur(6px)" }} />
          <span style={{ position: "relative", display: "inline-flex" }}>
            <DosMark size={84} />
          </span>
        </div>
        <div style={{ marginTop: 14, fontSize: 28, fontWeight: 900, letterSpacing: -0.6, fontFamily: DOS_DISPLAY, animation: "dosRise .5s .05s ease both" }}>
          Dance<span style={{ color: SKY }}>OS</span>
        </div>

        {/* the count-in, BIG (3 Oct 2026, "5678 bigger") — every class starts
            on it, so it is the screen's beat rather than a caption */}
        <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, fontSize: "clamp(28px, 8.4vw, 36px)", fontWeight: 900, letterSpacing: 0.5, fontFamily: DOS_DISPLAY, fontVariantNumeric: "tabular-nums" }}>
          {["5", "6", "7", "8"].map((n, i) => (
            <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 14, animation: `dosBeat 2.4s ease ${i * 0.3}s infinite` }}>
              {n}
              {i < 3 && <span style={{ color: LINE, fontSize: 26 }}>·</span>}
            </span>
          ))}
        </div>

        {/* the screen's own `<h1>` (28 Sep 2026) — the welcome screen wears no
            chrome at all, so this display line is the only thing naming it */}
        <h1
          style={{
            fontSize: "clamp(30px, 9.2vw, 40px)",
            fontWeight: 800,
            lineHeight: 1.06,
            letterSpacing: -1.1,
            margin: "14px 0 10px",
            fontFamily: DOS_DISPLAY,
            animation: "dosRise .6s .1s ease both",
          }}
        >
          The stage is yours.
        </h1>
        <div
          style={{
            fontSize: "clamp(13.5px, 3.8vw, 15.5px)",
            color: SUB,
            lineHeight: 1.5,
            fontWeight: 600,
            animation: "dosRise .6s .2s ease both",
          }}
        >
          Find classes. Build your crew. Get paid to dance.
        </div>
      </div>

      {/* absorbs the slack on a tall screen instead of leaving a void above the band */}
      <div style={{ flex: 1.2, minHeight: 24 }} />

      {/* THE LINE OVER THE BUTTONS (3 Oct 2026, the user: "Dance First, Think
          Later! also there above start dancing and login") — the same words
          Discover opens with, so the first page and the first tab speak alike */}
      <div style={{ textAlign: "center", fontSize: 20, fontWeight: 900, letterSpacing: -0.3, fontFamily: DOS_DISPLAY, marginBottom: 14, animation: "dosRise .6s .25s ease both" }}>
        Dance First, <span style={{ color: SKY }}>Think Later!</span>
      </div>

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
          Start Dancing
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
          Log In
        </Link>
        <p style={{ marginTop: 2, fontSize: 12.5, color: SUB, textAlign: "center", lineHeight: 1.5 }}>
          New here? Start Dancing takes a minute.
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
              background: i === 7 ? GOLD : SKY,
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
        LEARN <span style={{ color: SKY }}>·</span> TEACH <span style={{ color: SKY }}>·</span> CONNECT
        <br />
        PERFORM <span style={{ color: SKY }}>·</span> EARN <span style={{ color: SKY }}>·</span> GROW
      </div>
    </AuthShell>
  );
}
