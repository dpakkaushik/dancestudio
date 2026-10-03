"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteRoomAction } from "@/features/rooms/server-actions/rooms";
import { DOS_TOOLS, DeskHero } from "@/features/businesses/components/biz-kit";
import { DeskBody, DeskTop } from "@/components/ui/DeskSections";
import { ToolActions, ToolBody, ToolCard, ToolFacts, ToolHead, toolBtn } from "@/components/ui/ToolCard";
import { DOS_AMENITIES } from "@/lib/constants/amenities";
import { DOS_UI } from "@/lib/design/tokens";
import type { Room } from "@/types/room";
import { DeskAddButton } from "@/features/settings/components/settings-kit";

/** The studio's rooms — lifted from the prototype's business settings Rooms
 *  segment (DanceOSApp.jsx:18389-18425). One studio = one location, so these are
 *  THIS studio's rooms; another branch is another studio.
 *
 *  ⚠⚠ A CARD PER ROOM, AND NOTHING EDITED IN PLACE (4 Oct 2026, the user: "add
 *  room form to have amenities in it and edit only from editing form now not
 *  outside. new asset card design how we did for other pages"). The row used to
 *  carry the name and the capacity as live inputs committed on blur, and the
 *  amenities as toggles each written on a press — three doors to one room. The
 *  card SHOWS the room now: its name at a profile's size, how many it holds and
 *  how many amenities as figures, the amenities as chips; Edit opens the one
 *  form at `?edit={room}`, which is also where a room is added. */

const TINT = DOS_TOOLS.rooms.c;

export function RoomsManager({
  businessId,
  businessName,
  businessWhere,
  rooms,
  canEdit = true,
}: {
  businessId: string;
  businessName: string;
  businessWhere: string;
  rooms: Room[];
  /** ⚠ may this seat WRITE a room — owner or manager since 28 Sep 2026, which is
   *  what the two policies on `rooms` admit */
  canEdit?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };

  const remove = async (r: Room) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await deleteRoomAction({ businessId, roomId: r.id });
    setBusy(false);
    if (out.error) {
      setError(out.error);
      return;
    }
    fire(`${r.name} removed`);
  };

  return (
    <div style={{ maxWidth: 430, margin: "0 auto", padding: "0 16px 40px", fontFamily: DOS_UI, color: "var(--text)" }}>
      <DeskTop style={{ paddingBottom: 2 }}>
        {/* the shared tool hero — the page's own `<h1>` (22 Sep 2026) */}
        <DeskHero tool="rooms" as="h1" margin="0 0 8px" />
        <div style={{ fontSize: 11.5, color: "var(--sub)", fontWeight: 800, margin: "0 0 12px" }}>
          📍 {businessWhere} · {businessName}
        </div>
        {/* ⚠ only for somebody who may actually edit one (21 Sep 2026) */}
        {!canEdit ? (
          <div role="status" style={{ background: "var(--card)", borderRadius: 14, padding: 12, fontSize: 12, color: "var(--sub)", lineHeight: 1.5 }}>
            These are the studio&rsquo;s rooms. Changing them is the owner&rsquo;s and the managers&rsquo;.
          </div>
        ) : (
          <DeskAddButton label="Add room" href="?new=1" />
        )}
      </DeskTop>

      <DeskBody>
        {rooms.map((r) => {
          const amen = DOS_AMENITIES.filter((a) => r.amenities.includes(a));
          return (
            <ToolCard key={r.id} testId="room-card">
              <ToolHead
                tint={TINT}
                name={r.name}
                photoPath={null}
                eyebrow="Room"
                icon={<span aria-hidden="true" style={{ fontSize: 24 }}>🚪</span>}
              />
              <ToolBody>
                <ToolFacts
                  tint={TINT}
                  items={[
                    { label: "Holds", value: r.capacity, testId: "room-capacity" },
                    { label: amen.length === 1 ? "Amenity" : "Amenities", value: amen.length },
                  ]}
                />
                <div data-testid="room-amenities" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {amen.length === 0 ? (
                    <span style={{ fontSize: 11.5, color: "var(--muted)" }}>No amenities yet.</span>
                  ) : (
                    amen.map((a) => (
                      <span key={a} style={{ fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 999, background: `${TINT}1c`, color: "var(--text)", border: "1.5px solid var(--el)" }}>
                        {a}
                      </span>
                    ))
                  )}
                </div>
              </ToolBody>
              {canEdit ? (
                <ToolActions>
                  <Link href={`?edit=${r.id}`} scroll={false} aria-label={`Edit ${r.name}`} style={toolBtn("tinted", TINT)}>
                    Edit
                  </Link>
                  {rooms.length > 1 ? (
                    <button type="button" disabled={busy} onClick={() => void remove(r)} aria-label={`Remove ${r.name}`} style={toolBtn("danger", TINT)}>
                      Remove
                    </button>
                  ) : null}
                </ToolActions>
              ) : null}
            </ToolCard>
          );
        })}
        {rooms.length === 0 ? (
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>No rooms yet — add the first one above, and your classes can be held in it.</div>
        ) : null}

        {error ? <div role="alert" style={{ fontSize: 11.5, color: "#EF4444", fontWeight: 700, marginTop: 10 }}>{error}</div> : null}
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
          A room caps a class&rsquo;s capacity, and no two published classes share one at the same time.
        </div>
      </DeskBody>
      {toast ? (
        <div role="status" aria-live="polite" style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", boxShadow: "0 6px 24px rgba(0,0,0,.45)", color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650 }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
