import Link from "next/link";
import { INK } from "@/lib/design/tokens";

/** "CLASS DETAIL ›", ACROSS ITS WHOLE ROW (4 Oct 2026, the user: "In last collapse
 *  for all such class sections change open classes button to Class Detail and
 *  should cover its entire row") — the one door at the foot of every class's
 *  details, on the team member, student and routine pages alike. */
export function ClassDetailButton({ href, label, tint, testId }: { href: string; label: string; tint: string; testId: string }) {
  return (
    <Link
      href={href}
      aria-label={`Class Detail — ${label}`}
      data-testid={testId}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", boxSizing: "border-box", marginTop: 10, padding: "8px 12px", borderRadius: 999, fontSize: 12, fontWeight: 900, textDecoration: "none", color: INK, background: `${tint}1f`, border: `1.5px solid ${tint}77` }}
    >
      Class Detail ›
    </Link>
  );
}
