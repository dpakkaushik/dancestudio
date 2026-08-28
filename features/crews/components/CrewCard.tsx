import Link from "next/link";
import { gradientOf } from "@/features/profiles/components/PublicProfile";
import { DOS_DISPLAY, INK, SUB } from "@/lib/design/tokens";
import type { CrewSummary } from "@/types/crew";
import { initialsOf } from "./crew-kit";

/** Discover's crew card — the prototype's CompactCard (4370-4400), drawn two to
 *  a row under the Crews shelf: the gradient face, CREW over the name, the city
 *  and the style under it, the roster size at the foot. Opens the crew's page. */
export function CrewCard({ crew }: { crew: CrewSummary }) {
  const g = gradientOf(crew.name);
  return (
    <Link href={`/crew/${crew.id}`} aria-label={`${crew.name} — Crew`} style={{ display: "block", background: "var(--card)", border: "1px solid var(--el)", borderRadius: 18, padding: 12, color: INK, textDecoration: "none", minWidth: 0 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: `linear-gradient(135deg,${g[0]},${g[1]})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 18, fontWeight: 900, fontFamily: DOS_DISPLAY, letterSpacing: 0.4 }}>
        {initialsOf(crew.name)}
      </div>
      <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 1.4, color: "#DC2626", marginTop: 10 }}>CREW</div>
      <div style={{ fontSize: 13.5, fontWeight: 900, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{crew.name}</div>
      <div style={{ fontSize: 10.5, color: SUB, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {crew.city} · {crew.style}
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: INK, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
        {crew.members} member{crew.members === 1 ? "" : "s"}
      </div>
    </Link>
  );
}
