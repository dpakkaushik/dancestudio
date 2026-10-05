import type { ReactNode } from "react";
import { AmenityChip } from "@/components/ui/AmenityIcon";
import { FigureHead } from "@/components/ui/FigureHead";
import { InvertedPanel } from "@/components/ui/InvertedPanel";
import { DOS_DISPLAY } from "@/lib/design/tokens";
import { splitAddress } from "@/lib/format/address";
import type { Room } from "@/types/room";
import { TYPE } from "./profile-kit";

/** THE STUDIO ITSELF — WHERE IT IS, WHAT ITS ROOMS HAVE, WHAT IT SELLS (5 Oct 2026).
 *
 *  The user: *"Studio Public page- below Schedule should have full adrees and
 *  rooms with amenities mentioned alongside membership in a seprate segragation
 *  and others from next session below that."*
 *
 *  So the studio's page is three shapes now: the top squircle (the hero, the
 *  buttons, the Schedule bar), THIS — a section of its own on the page's theme
 *  holding the place and what is on sale — and the lower one with the next
 *  sessions and the team.
 *
 *  ⚠ THE ADDRESS IS THE CLASS PAGE'S OWN BOX (`class-address`, 4 Oct 2026) and the
 *  room tile is its room tile, so a studio's address and a room's amenities read
 *  the same way on the studio's page and on every class held there. The words
 *  come from `fullAddressOf` — the pin resolved, or the area and city — which is
 *  the Rooms desk's sentence too.
 *
 *  ⚠ NO MAPS BUTTON HERE: the Location button in the top squircle already opens
 *  the pin, and two doors to one subject is the shape C31 and C51 each undid. */
export function StudioPlace({
  address,
  rooms,
  tint,
  children,
}: {
  address: string;
  rooms: Room[];
  tint: string;
  /** what the studio sells — drawn under the rooms, inside this section */
  children?: ReactNode;
}) {
  const lines = splitAddress(address);
  const micro = { fontSize: 9, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)" } as const;
  return (
    <InvertedPanel ground="page" testId="studio-place">
      <FigureHead title={<span style={{ ...TYPE.shelf, color: "var(--text)" }}>At the studio</span>} margin="0 0 10px" />

      {/* ── WHERE — the address in words, street first, then city · state · PIN ── */}
      <div style={micro}>ADDRESS</div>
      <div data-testid="studio-address" style={{ display: "flex", alignItems: "flex-start", gap: 9, marginTop: 6, padding: "10px 11px", borderRadius: 13, background: "var(--el)" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
          <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
          <circle cx="12" cy="10" r="2.3" />
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", lineHeight: 1.4, overflowWrap: "anywhere" }}>{lines.street || "No address on record yet"}</div>
          {lines.locality ? <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>{lines.locality}</div> : null}
        </div>
      </div>

      {/* ── THE ROOMS, each with what it HAS — the amenities belong to the room,
          not to the studio, so they are drawn inside its tile ── */}
      {rooms.length > 0 ? (
        <>
          <FigureHead
            margin="14px 0 6px"
            title={<span style={micro}>ROOMS</span>}
            figure={<span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{rooms.length}</span>}
          />
          <div style={{ display: "grid", gap: 8 }}>
            {rooms.map((r) => (
              <div key={r.id} data-testid="studio-room" style={{ padding: "11px 12px 12px", borderRadius: 15, background: `${tint}0f`, border: "1.5px solid var(--el)" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span data-testid="studio-room-name" style={{ flex: 1, minWidth: 0, fontFamily: DOS_DISPLAY, fontSize: 19, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.15, color: "var(--text)", overflowWrap: "anywhere" }}>
                    {r.name}
                  </span>
                  <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: "var(--sub)", fontVariantNumeric: "tabular-nums" }}>Holds {r.capacity}</span>
                </div>
                <div style={{ ...micro, margin: "9px 0 6px" }}>AMENITIES</div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                  {r.amenities.length > 0 ? (
                    r.amenities.map((a) => <AmenityChip key={a} value={a} tint={tint} />)
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>Nothing listed for {r.name} yet.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {children}
    </InvertedPanel>
  );
}
