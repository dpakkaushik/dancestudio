/** Design tokens lifted verbatim from prototype/DanceOSApp.jsx lines 41-48 & 2697-2710. */

export const PINK = "#5AC8FA";
export const GREEN = "#22C55E";
export const GOLD = "#F59E0B";
export const RED = "#EF4444";
export const INK = "#FAFAFA";
export const LILAC = "#0A0A0A";
export const SUB = "#A3A3A3";
export const LINE = "rgba(255,255,255,.14)";

export const DOS_DISPLAY =
  'var(--font-sora), Sora, "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const DOS_UI =
  'var(--font-inter-tight), "Inter Tight", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

/** Per-role accent — prototype DOS_TINT (line 2704). */
export const DOS_TINT: Record<string, string> = {
  studio: "#3B82F6",
  trainer: "#EC4899",
  dancer: "#5AC8FA",
};

export const BTN_STYLE: React.CSSProperties = {
  padding: "15px",
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 15,
  textAlign: "center",
  cursor: "pointer",
  WebkitUserSelect: "none",
  userSelect: "none",
  border: "none",
  width: "100%",
};
