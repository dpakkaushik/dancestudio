import type { ReactNode } from "react";
import { DOS_DISPLAY } from "@/lib/design/tokens";

/* ── the crew mark — prototype CrewI (3146) ── */
const STROKE = { fill: "none", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const CrewI = ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...STROKE} aria-hidden="true">
    <circle cx="8" cy="8.4" r="2.5" />
    <circle cx="16" cy="8.4" r="2.5" />
    <circle cx="12" cy="6.2" r="2.5" />
    <path d="M3.5 19.5c.6-2.6 2.3-4 4.5-4M20.5 19.5c-.6-2.6-2.3-4-4.5-4M8 20c.7-3 2-4.4 4-4.4s3.3 1.4 4 4.4" />
  </svg>
);

export const dosToolPaint = (c: string) => `linear-gradient(135deg,${c} 0%, ${c}cc 55%, ${c}80 100%)`;

export const initialsOf = (name: string) => name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "C";

/** "Mar 2024" — the prototype's `since` */
export const sinceWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" }).format(new Date(iso));

export const pressKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

/* the desk's shared card and button (bizCard / bizBtn) */
export const bizCard: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--el)", borderRadius: 16, padding: "13px 14px", marginBottom: 10 };
export const bizBtn: React.CSSProperties = { textAlign: "center", padding: "12px", borderRadius: 14, border: "1.5px dashed var(--el)", color: "var(--sub)", fontWeight: 800, fontSize: 12.5, cursor: "pointer" };

/** the initials tile every crew wears until photos arrive (16336-16340) */
export function CrewFace({ name, size, grad, radius }: { name: string; size: number; grad: [string, string]; radius?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? Math.round(size * 0.3),
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(135deg,${grad[0]},${grad[1]})`,
        color: "#fff",
        fontSize: Math.round(size * 0.33),
        fontWeight: 900,
        fontFamily: DOS_DISPLAY,
        letterSpacing: 0.5,
      }}
    >
      {initialsOf(name)}
    </div>
  );
}

export function Toast({ msg }: { msg: string | null }): ReactNode {
  if (!msg) return null;
  return (
    <div role="status" aria-live="polite" style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", boxShadow: "0 6px 24px rgba(0,0,0,.45)", color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650 }}>
      {msg}
    </div>
  );
}
