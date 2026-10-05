import type { ReactNode } from "react";
import { DOS_DISPLAY } from "@/lib/design/tokens";

/** A SECTION AS A CARD WITH A TINTED HEADER BAND (4 Oct 2026; shared 5 Oct 2026).
 *
 *  The class page's own section (`Sec`, the user's "revamp class detail page also
 *  in new theme like class cards"): a 20px card on the page's ground, a header
 *  band washed in the section's colour with an icon in a soft square and the
 *  label in the display face, then the content.
 *
 *  It moved here when the Stats page and the dance style pages took the same
 *  look (5 Oct 2026, the user: "Redesign stats page according to the new look and
 *  all dance style pages as well"), so the three screens cannot drift into three
 *  versions of one card — the bill this repo has paid for `linkChip`, the figure
 *  row and the identity band.
 *
 *  ⚠ `data-sec` carries the label, which is what the class page's probes find a
 *  section by; nothing about that changed. */
export function SectionCard({
  icon,
  label,
  col,
  children,
  right,
  testId,
}: {
  icon: ReactNode;
  label: string;
  /** the section's colour — the band's wash, the icon's square */
  col: string;
  children: ReactNode;
  /** anything that rides at the band's right end (a count, a small control) */
  right?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-sec={label}
      data-testid={testId}
      style={{
        background: "var(--card)",
        border: "1.5px solid var(--el)",
        borderRadius: 20,
        overflow: "hidden",
        marginBottom: 12,
        textAlign: "left",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: `linear-gradient(135deg, ${col}1f, ${col}08)`, borderBottom: `1.5px solid ${col}26` }}>
        <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, background: `${col}24`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {icon}
        </span>
        <span style={{ flex: 1, fontFamily: DOS_DISPLAY, fontSize: 12.5, fontWeight: 900, letterSpacing: 0.5, color: "var(--text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {right}
      </div>
      <div style={{ padding: "12px 14px 13px" }}>{children}</div>
    </div>
  );
}
