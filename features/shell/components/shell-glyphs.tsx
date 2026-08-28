/* ── the studio glyph — prototype StudioI (DanceOSApp.jsx:3138), drawn by the
   shell's workspace strip and Home's Studios tile alike ── */
const STROKE = { fill: "none", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const StudioI = ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...STROKE} aria-hidden="true">
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9.5 21v-4h5v4M9 8h2M13 8h2M9 12h2M13 12h2" />
  </svg>
);
