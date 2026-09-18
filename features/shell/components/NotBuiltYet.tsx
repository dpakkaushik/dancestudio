import Link from "next/link";
import { DOS_TOOLS, DeskHero, type DosToolKey } from "@/features/tenants/components/biz-kit";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";

/** THE PROTOTYPE'S OWN "NOTHING HERE YET" (DanceOSApp.jsx:19164-19169) — the
 *  screen it draws for a drill nobody has built: the shrug, "Nothing here yet",
 *  one line saying so, and Go back.
 *
 *  WHY IT EXISTS HERE (18 Sep 2026). The user laid out the Home grid for all four
 *  kinds of account, and four of the tools on it — Routines, Memberships, Assets,
 *  and an organization's Team — have a prototype screen (S_choreos 17115,
 *  S_memberships 16846, S_assets 16791) or a decision (an organization is one
 *  login) but no desk in this app yet. This file's rule has been that a tile
 *  which opens nothing is a lie; a tile that opens THIS is not — it says what
 *  the tool will be, that it is not built, and how to go back, in the words the
 *  prototype uses for the same situation. Each such tile has a backlog row.
 *
 *  IT WEARS THE TOOL'S HERO (later on 18 Sep 2026, the user: "all heading when
 *  inside the page should have similar design as Crew, Calendar etc."), so a
 *  desk that is not built yet is still headed the way every built desk is — in
 *  the tile's own colour, saying what the tile said. */
export function NotBuiltYet({
  tool,
  what,
  back = "/",
  backLabel = "Go back",
}: {
  /** the tile's own tool — the page is headed what the tile said, in its colour */
  tool: DosToolKey;
  /** one sentence: what this desk will hold, in the prototype's terms */
  what: string;
  /** where Go back lands — Home, or the studio this desk belongs to */
  back?: string;
  backLabel?: string;
}) {
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, padding: "0 16px 40px", minHeight: "60vh", boxSizing: "border-box" }}>
      <DeskHero tool={tool} as="h1" />
      <div style={{ padding: "56px 8px 0", textAlign: "center" }}>
        <div aria-hidden="true" style={{ fontSize: 34, marginBottom: 10 }}>
          🤷
        </div>
        <div style={{ fontSize: 16, fontWeight: 900 }}>{DOS_TOOLS[tool].name} — nothing here yet</div>
        <div style={{ fontSize: 12, color: SUB, marginTop: 5, lineHeight: 1.5 }}>{what}</div>
        <div style={{ fontSize: 12, color: SUB, marginTop: 5, lineHeight: 1.5 }}>This desk isn’t built yet.</div>
        <Link
          href={back}
          aria-label={backLabel}
          style={{ marginTop: 18, display: "inline-block", padding: "12px 22px", borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 13, textDecoration: "none" }}
        >
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
