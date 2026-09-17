import Link from "next/link";
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
 *  prototype uses for the same situation. Each such tile has a backlog row. */
export function NotBuiltYet({
  tool,
  what,
  back = "/",
  backLabel = "Go back",
}: {
  /** the tile's own word — the page is headed what the tile said */
  tool: string;
  /** one sentence: what this desk will hold, in the prototype's terms */
  what: string;
  /** where Go back lands — Home, or the studio this desk belongs to */
  back?: string;
  backLabel?: string;
}) {
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, padding: "80px 24px", textAlign: "center", minHeight: "60vh", boxSizing: "border-box" }}>
      <div aria-hidden="true" style={{ fontSize: 34, marginBottom: 10 }}>
        🤷
      </div>
      <div style={{ fontSize: 16, fontWeight: 900 }}>{tool} — nothing here yet</div>
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
  );
}
