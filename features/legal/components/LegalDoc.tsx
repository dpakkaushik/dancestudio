import Link from "next/link";
import type { ReactNode } from "react";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";

/** THE LEGAL PAGES (18 Sep 2026, the user: "make one for this and link as well").
 *  Two documents, one dress: the app's own ink and ground, a 430px column like
 *  every other screen, a title, the date, the sections, and a way back. They
 *  live OUTSIDE the signed-in group, so a person reads them before they have an
 *  account — which is when the sign-up screen points at them. Plain HTML
 *  headings and paragraphs on purpose: a legal page is read, not operated. */

export function LegalDoc({ title, updated, intro, children }: { title: string; updated: string; intro: string; children: ReactNode }) {
  return (
    <main style={{ background: LILAC, color: INK, minHeight: "100vh", fontFamily: DOS_UI }}>
      <div style={{ maxWidth: 430, margin: "0 auto", padding: "22px 18px 48px", boxSizing: "border-box" }}>
        <nav style={{ display: "flex", gap: 14, fontSize: 12, fontWeight: 800 }}>
          <Link href="/login" style={{ color: SUB, textDecoration: "none" }}>
            ‹ DanceOS
          </Link>
          <Link href="/legal/terms" style={{ color: SUB, textDecoration: "none" }}>
            Terms
          </Link>
          <Link href="/legal/privacy" style={{ color: SUB, textDecoration: "none" }}>
            Privacy
          </Link>
        </nav>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.4, color: SUB, marginTop: 22 }}>DANCEOS · {updated.toUpperCase()}</div>
        <h1 style={{ fontFamily: DOS_DISPLAY, fontSize: 28, fontWeight: 900, letterSpacing: -0.8, lineHeight: 1.1, margin: "6px 0 10px" }}>{title}</h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: SUB, margin: "0 0 18px" }}>{intro}</p>
        <div className="dos-legal">{children}</div>
        <style>{`.dos-legal h2{font-family:${DOS_DISPLAY};font-size:17px;font-weight:900;letter-spacing:-.4px;margin:22px 0 6px}
.dos-legal p,.dos-legal li{font-size:13.5px;line-height:1.65;margin:0 0 8px}
.dos-legal ul{padding-left:18px;margin:0 0 8px}
.dos-legal a{color:inherit;font-weight:800}`}</style>
      </div>
    </main>
  );
}
