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
        border: "1.5px solid var(--el)",
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
            {/* ⚠ the page's own `<h1>` (28 Sep 2026). The chrome stopped printing a
                drill page's name when the wordmark became constant, and this hero
                is the only heading `/inbox/enquiries/{id}` has. */}
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: -0.5, fontFamily: DOS_DISPLAY, lineHeight: 1.18, marginTop: 1 }}>{title}</h1>
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
  /* the dance being MADE — a dancer mid-move, and the path of the move drawn
     beside them (4 Oct 2026: music notes read as "music" — and were already
     refused once for Routines, tool-grid.tsx) */
  choreographer: (
    <>
      <circle cx="7" cy="4.6" r="1.8" />
      <path d="M7 7.2 8 13M7.4 8.6 4 5.8M7.6 9 11 9.6M8 13l-2.6 6.5M8 13l3 3.6-1 3.4" />
      <path d="M14 19.5c5.5-1.5 7-9 2.4-13" strokeDasharray="2 2.2" />
      <path d="m16.4 6.5 2.6.1M16.4 6.5l.8 2.4" />
    </>
  ),
  /* the dance being DANCED — somebody under a spotlight on a stage */
  performer: (
    <>
      <path d="M9.6 2.5h4.8l-1 2.6h-2.8z" />
      <path d="M10.6 5.6 5.8 17.6M13.4 5.6l4.8 12" strokeDasharray="2 2" />
      <circle cx="12" cy="11.4" r="1.5" />
      <path d="M9.8 18.4 12 13.4l2.2 5" />
      <ellipse cx="12" cy="19.4" rx="7" ry="1.6" />
    </>
  ),
  /* judging — the score paddle a judge holds up, reading 10 */
  judge: (
    <>
      <rect x="5" y="3" width="14" height="11.5" rx="2.6" />
      <path d="M9 7.1l1.4-1v5.6" />
      <ellipse cx="14.4" cy="8.9" rx="1.8" ry="2.8" />
      <path d="M12 14.5V21M9.6 21h4.8" />
    </>
  ),
};

export function EnqIcon({ k, size = 14, color = "currentColor", sw = 1.8 }: { k: EnquiryTypeKey; size?: number; color?: string; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ENQ_ICON[k] ?? ENQ_ICON.choreographer}
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
