import type { CSSProperties, ReactNode } from "react";
import { DOS_DISPLAY, DOS_UI } from "@/lib/design/tokens";
import type { EnquiryTypeKey } from "@/types/enquiry";

/** The Inbox's atoms, lifted from the prototype's shared kit (DanceOSApp.jsx
 *  2713-2745): Surface — the single card used on every page; Eyebrow — the small
 *  caps label above every block; Figure — data set in mono so numbers align
 *  down a column; DosHero — the page header, tinted by whatever the page is
 *  about; and EnqIcon — one icon per enquiry type (5195-5206). */

export const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

export const money = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
/** "₹45k" / "₹1.2L" — the desk's short money (5906) */
export const moneyShort = (v: number) =>
  v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`;

export const initialsOf = (name: string) =>
  String(name || "?")
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function Surface({
  tint,
  pad,
  style,
  children,
}: {
  tint?: string;
  pad?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--el)",
        ...(tint ? { borderLeft: `4px solid ${tint}` } : {}),
        borderRadius: 18,
        padding: pad ?? "14px 15px",
        marginBottom: 9,
        ...(style ?? {}),
      }}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children, tint, right }: { children: ReactNode; tint?: string; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: tint ?? "var(--muted)", fontFamily: DOS_UI }}>
        {children}
      </span>
      {right ? <span style={{ marginLeft: "auto" }}>{right}</span> : null}
    </div>
  );
}

export function Figure({ children, size, tint, style }: { children: ReactNode; size?: number; tint?: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        fontFamily: DOS_MONO,
        fontSize: size ?? 13,
        fontWeight: 600,
        letterSpacing: -0.2,
        fontVariantNumeric: "tabular-nums",
        color: tint ?? "var(--text)",
        ...(style ?? {}),
      }}
    >
      {children}
    </span>
  );
}

export function DosHero({
  tint,
  label,
  title,
  sub,
  right,
}: {
  tint?: string;
  label?: string;
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  const c = tint ?? "#5AC8FA";
  return (
    <div
      style={{
        margin: "12px 16px 0",
        borderRadius: 22,
        padding: "15px 17px 14px",
        color: "#fff",
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(135deg, ${c}, #6D28D9)`,
      }}
    >
      <div style={{ position: "absolute", right: -30, top: -34, width: 132, height: 132, borderRadius: 66, background: "rgba(255,255,255,.13)" }} />
      <div style={{ position: "relative" }}>
        {label ? (
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.4, opacity: 0.85, fontFamily: DOS_UI }}>{label.toUpperCase()}</div>
        ) : null}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, fontFamily: DOS_DISPLAY, lineHeight: 1.18, marginTop: 1 }}>{title}</div>
            {sub ? <div style={{ fontSize: 10.5, opacity: 0.9, marginTop: 3, fontFamily: DOS_UI }}>{sub}</div> : null}
          </div>
          {right ?? null}
        </div>
      </div>
    </div>
  );
}

/* one icon per enquiry type — same line language as the event icons (5195) */
const ENQ_ICON: Record<EnquiryTypeKey, ReactNode> = {
  celebration: (
    <>
      <path d="M12 3.5v3M9 5l.9 1.6M15 5l-.9 1.6" />
      <path d="M5.5 20.5 8 11h8l2.5 9.5z" />
      <path d="M8.6 15h6.8" />
    </>
  ),
  corporate: (
    <>
      <rect x="4" y="7.5" width="16" height="12.5" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
      <path d="M4 13h16" />
    </>
  ),
  judge: (
    <>
      <path d="M7 4h10v4.5a5 5 0 0 1-10 0z" />
      <path d="M7 5.5H4.5V8A2.5 2.5 0 0 0 7 10.5M17 5.5h2.5V8A2.5 2.5 0 0 1 17 10.5" />
      <path d="M9.5 20h5M12 13.5V20" />
    </>
  ),
  private: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20c.7-3.4 3.4-5.2 6.5-5.2s5.8 1.8 6.5 5.2" />
    </>
  ),
  collab: (
    <>
      <circle cx="8.5" cy="8" r="2.8" />
      <circle cx="16" cy="9.5" r="2.3" />
      <path d="M3.5 19c.6-3 2.6-4.6 5-4.6s4.4 1.6 5 4.6" />
      <path d="M14 19c.4-2 1.6-3.2 3.2-3.2S20 17 20.4 19" />
    </>
  ),
};

export function EnqIcon({ k, size = 14, color = "currentColor", sw = 1.8 }: { k: EnquiryTypeKey; size?: number; color?: string; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ENQ_ICON[k] ?? ENQ_ICON.celebration}
    </svg>
  );
}

/** "4 h ago" / "2 d ago" — the desk's own clock words (ENQ_STORE `time`) */
export const agoWords = (iso: string, nowIso: string): string => {
  const ms = new Date(nowIso).getTime() - new Date(iso).getTime();
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return m <= 1 ? "just now" : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  const w = Math.round(d / 7);
  return `${w} w ago`;
};

/** "28 Nov 2026" for a date key, in the prototype's own grammar */
export const dateWords = (dayKey: string): string => {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return dayKey;
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
};

export const pressKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};
