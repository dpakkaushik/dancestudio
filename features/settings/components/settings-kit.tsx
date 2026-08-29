import type { CSSProperties, ReactNode } from "react";
import { DOS_DISPLAY, DOS_UI, INK, LILAC } from "@/lib/design/tokens";

/** The pieces the settings screens share, lifted from the prototype's BizShell
 *  (2950-2984): the tool card that heads every business page — a 22px-radius
 *  card in the tool's own gradient, the 130px white circle bleeding off the
 *  top-right, the title at 21px/800 and one sub-line — plus the card and the
 *  pill every row on those pages is made of (bizCard 2915, bizBtn 2920), and
 *  the verified tick (DosVerified 1499). */

export const bizCard: CSSProperties = { background: "var(--card)", border: "1px solid var(--el)", borderRadius: 16, padding: "13px 14px", marginBottom: 9 };
export const bizBtn: CSSProperties = { textAlign: "center", padding: 13, borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 13.5, cursor: "pointer", border: "none", fontFamily: "inherit", width: "100%", textDecoration: "none", display: "block" };
export const ghostBtn: CSSProperties = { ...bizBtn, background: "var(--card)", color: "var(--text)", border: "1px solid var(--el)", fontWeight: 800 };
export const chip = (on: boolean): CSSProperties => ({ flexShrink: 0, padding: "7px 12px", borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: 800, background: on ? "var(--text)" : "var(--card)", color: on ? "var(--solid)" : "var(--sub)", border: "1px solid var(--el)", fontFamily: "inherit", whiteSpace: "nowrap" });
export const eyebrow: CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", margin: "2px 0 8px", textTransform: "uppercase" };
export const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
export const dayWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(new Date(iso));
export const dateWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso));

export function BizPage({ title, sub, grad, children }: { title: string; sub?: string; grad: string; children: ReactNode }) {
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "8px 16px 40px", boxSizing: "border-box" }}>
      <div style={{ borderRadius: 22, padding: "15px 17px 14px", marginBottom: 12, position: "relative", overflow: "hidden", color: "#fff", background: grad }}>
        <div aria-hidden="true" style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
        <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, position: "relative", fontFamily: DOS_DISPLAY, lineHeight: 1.18, margin: 0 }}>{title}</h1>
        {sub ? <div style={{ fontSize: 11, opacity: 0.9, marginTop: 3, position: "relative" }}>{sub}</div> : null}
      </div>
      {children}
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
