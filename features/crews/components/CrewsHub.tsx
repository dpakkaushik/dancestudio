import Link from "next/link";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { CREW_TINT, type CrewSummary } from "@/types/crew";
import { CrewI, dosToolPaint } from "./crew-kit";

/** The Crews hub — prototype S_bizhub with kind="crews" (2585-2691): TWO LISTS,
 *  BECAUSE THERE ARE TWO RELATIONSHIPS. "A crew you lead and a crew you dance in
 *  are not the same object with a flag on it: one has a roster … to keep, and
 *  the other has a page you read." The ones you run come first (Manage ›), the
 *  dashed Create crew door under them, and below, under their own heading, the
 *  crews you are simply IN (Profile ›). Where a row goes decides what pressing
 *  it does. */

const head = (t: string) => <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: "var(--muted)", margin: "2px 0 8px" }}>{t}</div>;

function Row({ crew, own, sub }: { crew: CrewSummary; own: boolean; sub: string }) {
  const accent = CREW_TINT;
  return (
    <Link
      href={own ? `/crews/${crew.id}/manage` : `/crew/${crew.id}`}
      aria-label={`${crew.name} — ${own ? "manage the crew" : "open the profile"}`}
      style={{ display: "flex", alignItems: "center", gap: 11, background: "var(--card)", border: "1px solid var(--el)", borderLeft: `4px solid ${own ? accent : "var(--el)"}`, borderRadius: 16, padding: "12px 13px", marginBottom: 9, color: INK, textDecoration: "none" }}
    >
      <span style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: own ? `${accent}1c` : "var(--el)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CrewI size={17} color={own ? accent : "var(--sub)"} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{crew.name}</div>
        <div style={{ fontSize: 10, color: SUB, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
      </div>
      {/* the word on the right is the promise the tap keeps */}
      <span style={{ fontSize: 10.5, fontWeight: 800, color: own ? accent : SUB, flexShrink: 0 }}>{own ? "Manage ›" : "Profile ›"}</span>
    </Link>
  );
}

const sinceWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" }).format(new Date(iso));

export function CrewsHub({ led, member }: { led: CrewSummary[]; member: Array<CrewSummary & { since: string }> }) {
  const accent = CREW_TINT;
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40 }}>
      <div style={{ padding: "14px 16px 0" }}>
        {/* the same paint, and the same word, as the tile you pressed to get here */}
        <div style={{ borderRadius: 22, padding: "15px 17px 14px", marginBottom: 12, position: "relative", overflow: "hidden", color: "#fff", background: dosToolPaint(accent) }}>
          <div style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, position: "relative", fontFamily: DOS_DISPLAY, lineHeight: 1.18 }}>Crews</div>
        </div>
        {head("CREWS YOU LEAD")}
        {led.length ? (
          led.map((c) => <Row key={c.id} crew={c} own sub={`${c.members} member${c.members === 1 ? "" : "s"} · ${c.style} · ${c.city}`} />)
        ) : (
          <div style={{ fontSize: 11.5, color: SUB, padding: "0 2px 10px" }}>You do not lead a crew yet.</div>
        )}
        <Link
          href="/crews/new"
          style={{ display: "block", textAlign: "center", padding: "13px", borderRadius: 16, border: `1.5px dashed ${accent}`, color: accent, fontWeight: 800, fontSize: 13, textDecoration: "none" }}
        >
          ＋ Create crew
        </Link>
        {/* and below it, the places that are not yours to run */}
        {member.length > 0 ? (
          <div style={{ marginTop: 20 }}>
            {head("CREWS YOU ARE IN")}
            {member.map((c) => (
              <Row key={c.id} crew={c} own={false} sub={`${c.style} · ${c.city} · member since ${sinceWords(c.since)}`} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
