"use client";

import { useState } from "react";
import { dosKey } from "@/features/classes/components/ShareSheet";
import {
  createRoomAction,
  deleteRoomAction,
  updateRoomAction,
} from "@/features/rooms/server-actions/rooms";
import { DOS_AMENITIES } from "@/lib/constants/amenities";
import { DOS_DISPLAY, DOS_UI, PINK } from "@/lib/design/tokens";
import type { Room } from "@/types/room";

/** The studio's rooms — lifted from the prototype's business settings Rooms
 *  segment (DanceOSApp.jsx:18389-18425): a card per room with its name and
 *  capacity edited in place, the amenities folded away until you want them, and
 *  the closing note that says what a room actually decides. One studio = one
 *  location, so these are THIS studio's rooms; another branch is another studio. */

export function RoomsManager({
  tenantId,
  tenantName,
  tenantWhere,
  rooms,
}: {
  tenantId: string;
  tenantName: string;
  tenantWhere: string;
  rooms: Room[];
}) {
  const [amenFor, setAmenFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /* the row being typed in — committed on blur, so every keystroke is not a write */
  const [draft, setDraft] = useState<{ id: string; name: string; capacity: number } | null>(null);

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };

  const run = async (op: () => Promise<{ error: string | null }>, doneMsg: string | null) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await op();
    setBusy(false);
    if (out.error) {
      setError(out.error);
      return;
    }
    if (doneMsg) fire(doneMsg);
  };

  const commit = (room: Room) => {
    if (!draft || draft.id !== room.id) return;
    const name = draft.name.trim();
    const capacity = draft.capacity;
    setDraft(null);
    if (!name || (name === room.name && capacity === room.capacity)) return;
    void run(
      () => updateRoomAction({ tenantId, roomId: room.id, name, capacity, amenities: room.amenities }),
      null
    );
  };

  const toggleAmenity = (room: Room, amenity: string) => {
    const on = room.amenities.includes(amenity);
    const amenities = on
      ? room.amenities.filter((a) => a !== amenity)
      : [...room.amenities, amenity];
    void run(
      () =>
        updateRoomAction({
          tenantId,
          roomId: room.id,
          name: room.name,
          capacity: room.capacity,
          amenities,
        }),
      on ? `${amenity} removed from ${room.name}` : `${amenity} added to ${room.name}`
    );
  };

  const card: React.CSSProperties = {
    background: "var(--card)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  };

  return (
    <div
      style={{
        maxWidth: 430,
        margin: "0 auto",
        padding: "8px 16px 40px",
        fontFamily: DOS_UI,
        color: "var(--text)",
      }}
    >
      {/* BizShell's hero (2964-2976): the tile's paint, the tool's name, nothing else */}
      <div style={{ borderRadius: 22, padding: "15px 17px 14px", marginBottom: 12, position: "relative", overflow: "hidden", color: "#fff", background: `linear-gradient(135deg,#3498DB 0%, #3498DBcc 55%, #3498DB80 100%)` }}>
        <div aria-hidden="true" style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, position: "relative", fontFamily: DOS_DISPLAY, lineHeight: 1.18 }}>Rooms</div>
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <b style={{ fontSize: 14 }}>📍 {tenantWhere}</b>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--sub)" }}>{tenantName}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
          {rooms.length} room{rooms.length === 1 ? "" : "s"} · one studio = one location
        </div>
        {rooms.map((r) => {
          const open = amenFor === r.id;
          const editing = draft?.id === r.id;
          return (
            <div key={r.id} style={{ background: "var(--el)", borderRadius: 12, padding: "8px 11px", marginTop: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={editing ? draft.name : r.name}
                  aria-label={`${r.name} name`}
                  onChange={(e) =>
                    setDraft({ id: r.id, name: e.target.value, capacity: editing ? draft.capacity : r.capacity })
                  }
                  onBlur={() => commit(r)}
                  style={{
                    flex: 2,
                    minWidth: 0,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--text)",
                    fontSize: 12.5,
                    fontWeight: 800,
                    fontFamily: "inherit",
                  }}
                />
                <span style={{ fontSize: 11, color: "var(--sub)" }}>cap</span>
                <input
                  type="number"
                  min={1}
                  value={editing ? draft.capacity : r.capacity}
                  aria-label={`${r.name} capacity`}
                  onChange={(e) =>
                    setDraft({
                      id: r.id,
                      name: editing ? draft.name : r.name,
                      capacity: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  onBlur={() => commit(r)}
                  style={{
                    width: 52,
                    background: "transparent",
                    border: "1px solid var(--card)",
                    borderRadius: 8,
                    outline: "none",
                    color: "var(--text)",
                    fontSize: 12.5,
                    fontWeight: 800,
                    padding: "3px 6px",
                    fontFamily: "inherit",
                  }}
                />
                {rooms.length > 1 && (
                  <span
                    role="button"
                    tabIndex={0}
                    onKeyDown={dosKey}
                    aria-label={`Remove ${r.name}`}
                    onClick={() => void run(() => deleteRoomAction({ tenantId, roomId: r.id }), `${r.name} removed`)}
                    style={{ fontSize: 13, color: "var(--sub)", cursor: "pointer" }}
                  >
                    ✕
                  </span>
                )}
              </div>
              {/* the amenities live with the room, folded away until you want them */}
              <div
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                aria-expanded={open}
                aria-label={`Amenities in ${r.name}`}
                onClick={() => setAmenFor(open ? null : r.id)}
                style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, cursor: "pointer" }}
              >
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--sub)" }}>Amenities</span>
                <span
                  style={{
                    fontSize: 10.5,
                    color: "var(--muted)",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.amenities.length ? r.amenities.join("  ") : "none yet"}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--muted)",
                    transform: open ? "rotate(90deg)" : "none",
                    transition: "transform .15s",
                  }}
                >
                  ›
                </span>
              </div>
              {open && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: "1px solid var(--card)",
                  }}
                >
                  {DOS_AMENITIES.map((a) => {
                    const on = r.amenities.includes(a);
                    return (
                      <span
                        role="button"
                        tabIndex={0}
                        onKeyDown={dosKey}
                        key={a}
                        aria-pressed={on}
                        onClick={() => toggleAmenity(r, a)}
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "5px 10px",
                          borderRadius: 999,
                          cursor: "pointer",
                          background: on ? "var(--text)" : "var(--card)",
                          color: on ? "var(--solid)" : "var(--sub)",
                          border: `1px solid ${on ? "var(--text)" : "var(--el)"}`,
                        }}
                      >
                        {a}
                        {on ? " ✓" : ""}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {rooms.length === 0 && (
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10 }}>
            No rooms yet — add the first one below, and your classes can be held in it.
          </div>
        )}
      </div>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={dosKey}
        aria-label="Add room"
        onClick={() =>
          void run(
            () =>
              createRoomAction({
                tenantId,
                name: `Room ${rooms.length + 1}`,
                capacity: 20,
              }),
            "● Room added"
          )
        }
        style={{
          textAlign: "center",
          padding: "12px",
          borderRadius: 16,
          border: `1.5px dashed ${PINK}`,
          color: PINK,
          fontWeight: 800,
          fontSize: 13.5,
          cursor: "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        ＋ Add room
      </div>
      {error && (
        <div style={{ fontSize: 11.5, color: "#EF4444", fontWeight: 700, marginTop: 10 }}>{error}</div>
      )}
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
        A new location is a new studio — create it from Home ▸ Run your business. Rooms cap class
        capacity · no double-booking (server-enforced).
      </div>
      {toast && (
        <div
          role="status" aria-live="polite" style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", boxShadow: "0 6px 24px rgba(0,0,0,.45)", color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650 }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
