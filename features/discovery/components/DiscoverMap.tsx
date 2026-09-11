"use client";

import { GoogleMapPicker, type MapMarker } from "@/features/geo/components/GoogleMap";
import { INK, SUB } from "@/lib/design/tokens";

const CARD = "var(--card)";
const EL = "var(--el)";

/** DISCOVER, AS A MAP (11 Sep 2026 — the user: "if can show it on map much
 *  better, user will check nearest studio using location only").
 *
 *  The same Google map the picker is, with its centre pin off and every business
 *  on the shelf drawn as a pin you can press. It is centred where the list is
 *  measured from — the city's centre, or the person's own point when Near me
 *  is on — so what is close on the map is what is first in the list.
 *
 *  Only businesses that have PLACED THEMSELVES are drawn. The rest still sit on
 *  their city's centroid, and twenty pins on one point at the middle of town is
 *  not a map of anything; the line under the map says how many are missing so
 *  the gap is visible rather than quietly wrong. */
export function DiscoverMap({
  centre,
  markers,
  unplaced,
  what,
}: {
  centre: { lat: number; lng: number };
  markers: MapMarker[];
  /** how many businesses on the shelf could not be drawn */
  unplaced: number;
  what: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <GoogleMapPicker value={centre} zoom={markers.length > 0 ? 13 : 12} height={300} onPick={() => undefined} markers={markers} showPin={false} label={`${what} on the map`} />
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: 6, fontSize: 10.5, color: SUB, padding: "0 2px" }}>
        <span style={{ fontWeight: 800, color: INK }}>
          {markers.length === 0 ? `No ${what.toLowerCase()} on the map yet` : `${markers.length} ${what.toLowerCase()} on the map`}
        </span>
        {unplaced > 0 ? <span>{unplaced} more have not placed themselves yet</span> : null}
      </div>
      {markers.length === 0 ? (
        <div style={{ background: CARD, border: `1.5px dashed ${EL}`, borderRadius: 14, padding: "10px 12px", marginTop: 8, fontSize: 11, color: SUB, lineHeight: 1.5 }}>
          A business appears here once its owner puts the pin on its door — from Edit on its page, or when the studio is created. The list below still has every one of them.
        </div>
      ) : null}
    </div>
  );
}
