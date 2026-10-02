"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Portal } from "@/components/ui/Portal";
import { dosStyleColor } from "@/lib/constants/styles";
import { DOS_DISPLAY, DOS_UI } from "@/lib/design/tokens";
import { dosToolPaint } from "@/lib/format/styleInk";

/** THE BOW, FOR EVERY BEGINNING (2 Oct 2026, the user: "on creation similar
 *  welcome message for studio and crew profiles as we get on sign up for users
 *  and same should be once converted and subscribed for being an artist").
 *
 *  The look is onboarding's own "Take a bow" finish screen (prototype
 *  3915-3943, `OnboardingForm`): the radial plum room, the confetti, the
 *  orbiting conic ring round a glowing disc, the 5 · 6 · 7 · 8 count, a
 *  display title, the styles as pills and one pink pill that leaves. It is
 *  mirrored rather than shared — onboarding's screen is a whole PAGE with the
 *  person's photo and the cookie-clearing action under it, and refactoring the
 *  one door every account walks through to save forty lines is not a trade.
 *
 *  ⚠ PRESENTATION ONLY. It is opened by an address (`?welcome=studio|crew|artist`)
 *  and checks nothing: every page it sits on has already authorised its reader,
 *  and the bow says only what that page could say. Continue REPLACES the address
 *  without the param (`scroll: false`), so back does not re-open it and a reload
 *  after closing does not either.
 *
 *  ⚠ PORTALLED, above everything the app layers (the top bar at 400, sheets at
 *  600, `PickSheet` at 960) — a modal belongs at the root (`Portal`, 16 Sep).
 *  ⚠ Reduced motion: the confetti is not drawn and nothing animates. */

export type WelcomePill = { label: string; color?: string };

const Z_BOW = 990;

export function WelcomeBow({
  label,
  emoji = "🕺",
  title,
  subtitle,
  pills = [],
  pillsCaption,
  note,
  primaryLabel = "Continue",
  onPrimary,
  secondary,
}: {
  /** the dialog's accessible name, e.g. "Welcome to your studio" */
  label: string;
  /** what the glowing disc holds */
  emoji?: string;
  title: string;
  subtitle?: string;
  /** dance styles (coloured off the registry) or tools (their own colour) */
  pills?: WelcomePill[];
  pillsCaption?: string;
  /** the one card under the pills: what happens next */
  note?: ReactNode;
  primaryLabel?: string;
  onPrimary: () => void;
  secondary?: { label: string; href: string };
}) {
  const primary = useRef<HTMLButtonElement>(null);
  /* the press lands on the way out — a dialog that opens on its own puts focus
     where the reader is expected to go next */
  useEffect(() => {
    primary.current?.focus();
  }, []);
  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-testid="welcome-bow"
        onKeyDown={(e) => {
          if (e.key === "Escape") onPrimary();
        }}
        style={{ position: "fixed", inset: 0, zIndex: Z_BOW, background: "radial-gradient(ellipse at 50% 16%, #2E1D45 0%, #0E0A14 60%)", color: "#F5F2FA", fontFamily: DOS_UI, overflowY: "auto", textAlign: "center" }}
      >
        <style>{`
          @keyframes dosBowConf{0%{transform:translateY(-8vh) rotate(0)}100%{transform:translateY(108vh) rotate(720deg)}}
          @keyframes dosBowOrb{to{transform:rotate(360deg)}}
          @keyframes dosBowGlow{0%,100%{box-shadow:0 0 24px rgba(236,72,153,.4)}50%{box-shadow:0 0 46px rgba(236,72,153,.75)}}
          @keyframes dosBowRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
          @media (prefers-reduced-motion:reduce){[data-testid="welcome-bow"] *{animation:none !important}[data-dos-confetti]{display:none}}
        `}</style>
        {Array.from({ length: 16 }, (_, i) => (
          <div
            key={i}
            aria-hidden="true"
            data-dos-confetti=""
            style={{ position: "fixed", top: 0, left: `${(i * 61) % 100}%`, width: 7, height: 11, borderRadius: 2, background: ["#EC4899", "#F59E0B", "#22C55E", "#3498DB", "#7C3AED"][i % 5], animation: `dosBowConf ${2.6 + (i % 5) * 0.5}s linear ${i * 0.22}s infinite`, opacity: 0.85, pointerEvents: "none" }}
          />
        ))}
        <div style={{ position: "relative", maxWidth: 430, margin: "0 auto", padding: "52px 22px 44px", boxSizing: "border-box", minHeight: "100%" }}>
          <div style={{ fontSize: 12, letterSpacing: 3, color: "#B7AECB", animation: "dosBowRise .5s ease both" }}>5 · 6 · 7 · 8</div>
          <div style={{ display: "flex", justifyContent: "center", margin: "22px 0 0", animation: "dosBowRise .5s .1s ease both" }}>
            <div style={{ position: "relative", width: 112, height: 112 }}>
              <div aria-hidden="true" style={{ position: "absolute", inset: -7, borderRadius: 63, animation: "dosBowOrb 3s linear infinite", background: "conic-gradient(from 0deg,#EC4899,#F59E0B,transparent 62%,#EC4899)", WebkitMask: "radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 3px))", mask: "radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 3px))" }} />
              <div aria-hidden="true" style={{ width: 112, height: 112, borderRadius: 56, animation: "dosBowGlow 2.4s ease infinite", background: "#1A1425", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42 }}>
                {emoji}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, margin: "18px 0 4px", animation: "dosBowRise .5s .2s ease both", fontFamily: DOS_DISPLAY, overflowWrap: "anywhere" }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 13.5, color: "#B7AECB", animation: "dosBowRise .5s .25s ease both" }}>{subtitle}</div> : null}
          {pills.length > 0 ? (
            <>
              <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8, margin: "28px 0 8px", animation: "dosBowRise .5s .35s ease both" }}>
                {pills.map((p) => {
                  const c = p.color || dosStyleColor(p.label) || "#EC4899";
                  return (
                    <span key={p.label} style={{ padding: "9px 15px", borderRadius: 999, background: dosToolPaint(c), color: "#fff", fontWeight: 800, fontSize: 13, fontFamily: DOS_DISPLAY, letterSpacing: -0.2, boxShadow: `0 3px 12px ${c}44` }}>
                      {p.label}
                    </span>
                  );
                })}
              </div>
              {pillsCaption ? <div style={{ fontSize: 11.5, color: "#7E7492", animation: "dosBowRise .5s .4s ease both" }}>{pillsCaption}</div> : null}
            </>
          ) : null}
          {note ? (
            <div style={{ fontSize: 12.5, color: "#B7AECB", marginTop: 22, background: "rgba(255,255,255,.05)", border: "1.5px solid #241B33", borderRadius: 14, padding: "11px 14px", lineHeight: 1.55, animation: "dosBowRise .5s .5s ease both", textAlign: "left" }}>{note}</div>
          ) : null}
          <button
            ref={primary}
            type="button"
            onClick={onPrimary}
            style={{ marginTop: 26, padding: 16, borderRadius: 999, background: "#EC4899", color: "#fff", fontWeight: 800, fontSize: 15.5, cursor: "pointer", animation: "dosBowGlow 2.4s ease infinite", border: "none", width: "100%", fontFamily: "inherit" }}
          >
            {primaryLabel}
          </button>
          {secondary ? (
            /* a REPLACE, so back from where it leads does not land on the
               `?welcome=` entry and re-open the bow */
            <Link href={secondary.href} replace style={{ display: "block", marginTop: 14, fontSize: 13, fontWeight: 800, color: "#B7AECB", textDecoration: "none" }}>
              {secondary.label}
            </Link>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}

/** The bow, drawn when — and only when — the address says `?welcome={kind}`.
 *  Continue drops the param with a REPLACE (back does not bring it back) and the
 *  bow goes at once, before the router has answered. */
export function WelcomeFromUrl(props: { kind: string } & Omit<Parameters<typeof WelcomeBow>[0], "onPrimary">) {
  /* `useSearchParams` wants a Suspense boundary above it; the bow is decoration,
     so it suspends to nothing */
  return (
    <Suspense fallback={null}>
      <WelcomeFromUrlInner {...props} />
    </Suspense>
  );
}

function WelcomeFromUrlInner({ kind, ...bow }: { kind: string } & Omit<Parameters<typeof WelcomeBow>[0], "onPrimary">) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [closed, setClosed] = useState(false);
  if (closed || params.get("welcome") !== kind) return null;
  const close = () => {
    setClosed(true);
    const rest = new URLSearchParams(params.toString());
    rest.delete("welcome");
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return <WelcomeBow {...bow} onPrimary={close} />;
}
