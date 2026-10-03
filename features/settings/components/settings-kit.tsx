import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { DOS_DISPLAY, DOS_UI, INK, LILAC } from "@/lib/design/tokens";
import { DeskHero, type DosToolKey } from "@/features/businesses/components/biz-kit";
import { DeskBody, DeskMiddle, DeskTop } from "@/components/ui/DeskSections";

/** The pieces the settings screens share, lifted from the prototype's BizShell
 *  (2950-2984): the tool card that heads every business page — a 22px-radius
 *  card in the tool's own gradient, the 130px white circle bleeding off the
 *  top-right, the title at 21px/800 and one sub-line — plus the card and the
 *  pill every row on those pages is made of (bizCard 2915, bizBtn 2920), and
 *  the verified tick (DosVerified 1499). */

export const bizCard: CSSProperties = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "13px 14px", marginBottom: 9 };
export const bizBtn: CSSProperties = { textAlign: "center", padding: 13, borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 13.5, cursor: "pointer", border: "none", fontFamily: "inherit", width: "100%", textDecoration: "none", display: "block" };
export const ghostBtn: CSSProperties = { ...bizBtn, background: "var(--card)", color: "var(--text)", border: "1.5px solid var(--el)", fontWeight: 800 };
export const chip = (on: boolean): CSSProperties => ({ flexShrink: 0, padding: "7px 12px", borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: 800, background: on ? "var(--text)" : "var(--card)", color: on ? "var(--solid)" : "var(--sub)", border: "1.5px solid var(--el)", fontFamily: "inherit", whiteSpace: "nowrap" });
/* `--sub`, not `--muted` (16 Sep 2026): the same legibility fix the Edit
   sheets' field labels got, so the Media desk's own headings are not a
   different grey from the sheet that edits the same two pictures */
export const eyebrow: CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--sub)", margin: "2px 0 8px", textTransform: "uppercase" };
/** ＋ ADD — ONE CONTROL, EVERY DESK (20 Sep 2026, the user: "Add button for team,
 *  room, crew to be similar to add class and event and should be on top of the
 *  page"). Classes and Events have opened with this pill since the parity audit;
 *  Team, Rooms and Crews each had their own dashed row further down the page, in
 *  three different shapes. It is the `bizBtn` pill with the same ＋ those two
 *  draw, so a desk is a desk whatever it holds.
 *
 *  ⚠ It takes `onClick` OR `href`, never both: Team and Rooms open a sheet in
 *  place, Crews is a route. Three copies of one pill is how the bands drifted
 *  earlier today, so this is the one declaration and the desks read it. */
export function DeskAddButton({ label, href, onClick }: { label: string; href?: string; onClick?: () => void }) {
  const inner = (
    <>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
      {label}
    </>
  );
  const style: CSSProperties = { ...bizBtn, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 };
  if (href) {
    /* ⚠ A `next/link`, NOT a bare `<a>` (22 Sep 2026). Every href this takes now
       points at the SAME page with `?new=1` on it — the form opens as a sheet
       over the desk that offered it — and a bare anchor would reload the desk to
       do that, throwing away its scroll and re-running every read behind it.
       `scroll={false}` for the same reason: the desk must not jump when the
       sheet opens over it. */
    return (
      <Link href={href} scroll={false} aria-label={label} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} onClick={onClick} style={style}>
      {inner}
    </button>
  );
}

export const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
export const dayWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(new Date(iso));
export const dateWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso));

/** ⚠ A TOOL'S PAGE IS HEADED BY ITS TOOL (28 Sep 2026, the user: "all tools
 *  heading should be done in the same way like classes and events, not
 *  happening for subscriptions, enquiries").
 *
 *  `BizPage` drew its own gradient header, so a screen behind a TILE could wear
 *  any colour its author picked — and Subscription wore amber→pink while its own
 *  tile on every grid is `DOS_TOOLS.subscription`'s blue. Pass `tool` and the
 *  header IS `DeskHero`, the same object the Classes and Events desks wear, so
 *  the tile and the page it opens read one vocabulary by construction.
 *  `grad` stays for the screens that are NOT tools — Verification is the one
 *  that matters (C53: a desk hero titles itself from `DOS_TOOLS`, and inventing
 *  a tool colour for something on nobody's grid is what that decision refused). */
export function BizPage({
  title,
  sub,
  grad,
  tool,
  top,
  middle,
  children,
}: {
  title: string;
  sub?: string;
  grad?: string;
  tool?: DosToolKey;
  /** the controls that choose WHAT is shown (segments, filter chips) — drawn in
   *  the top section under the heading (3 Oct 2026, C116) */
  top?: ReactNode;
  /** optional summary figures between the heading and the list (C116) */
  middle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "8px 16px 40px", boxSizing: "border-box" }}>
      {/* ⚠ THE TOP SECTION (3 Oct 2026, C116): the heading and the controls that
          choose what is shown; the figures (if any) in the middle; the page's own
          content in the lower section — Discover's and the Inbox's three shapes. */}
      <DeskTop>
        {tool ? (
          /* ⚠ THE SUB-LINE SURVIVES THE SWAP, and it has to: `DeskHero` names the
             TOOL and an organization runs several businesses, so "whose
             subscription is this" would otherwise leave the screen — the same
             reason every other tool hero in the app carries the business's name
             under it (C49). */
          <>
            <DeskHero tool={tool} as="h1" margin="0" />
            {sub ? <div style={{ fontSize: 11, fontWeight: 700, color: "var(--sub)", margin: "5px 2px 0" }}>{sub}</div> : null}
          </>
        ) : (
          <div style={{ borderRadius: 22, padding: "15px 17px 14px", position: "relative", overflow: "hidden", color: "#fff", background: grad }}>
            <div aria-hidden="true" style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
            <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, position: "relative", fontFamily: DOS_DISPLAY, lineHeight: 1.18, margin: 0 }}>{title}</h1>
            {sub ? <div style={{ fontSize: 11, opacity: 0.9, marginTop: 3, position: "relative" }}>{sub}</div> : null}
          </div>
        )}
        {top ? <div style={{ marginTop: 12 }}>{top}</div> : null}
      </DeskTop>
      {middle ? <DeskMiddle>{middle}</DeskMiddle> : null}
      <DeskBody>{children}</DeskBody>
    </div>
  );
}

/** DosVerified (1499): the blue tick beside a verified name */
export function VerifiedTick({ size = 15 }: { size?: number }) {
  return (
    <span aria-label="Verified" title="Verified" style={{ display: "inline-flex", flexShrink: 0, lineHeight: 0, verticalAlign: "middle" }}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#1D9BF0" d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81C14.67 2.63 13.43 1.75 12 1.75s-2.67.88-3.34 2.19c-1.39-.46-2.9-.2-3.91.81s-1.27 2.52-.81 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.27 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z" />
        <path fill="#fff" d="m10.93 15.72-3.2-3.2 1.42-1.41 1.78 1.78 4.35-4.35 1.41 1.42z" />
      </svg>
    </span>
  );
}

/** the canonical toast (BizShell 2977-2982) */
export function BizToast({ msg, bottom = 26 }: { msg: string | null; bottom?: number }) {
  if (!msg) return null;
  return (
    <div role="status" aria-live="polite" style={{ position: "fixed", bottom, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", boxShadow: "0 6px 24px rgba(0,0,0,.45)", color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650 }}>
      {msg}
    </div>
  );
}
