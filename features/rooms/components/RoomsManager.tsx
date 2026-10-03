"use client";

import { useState } from "react";
import { createRoomAction, deleteRoomAction, updateRoomAction } from "@/features/rooms/server-actions/rooms";
import { RoomForm, type RoomDraft } from "@/features/rooms/components/RoomForm";
import { DOS_TOOLS, DeskHero } from "@/features/businesses/components/biz-kit";
import { DeskBody, DeskMiddle, DeskTop } from "@/components/ui/DeskSections";
import { ToolActions, ToolBody, ToolCard, ToolFace, ToolFacts, ToolHead, toolBtn } from "@/components/ui/ToolCard";
import { DOS_AMENITIES } from "@/lib/constants/amenities";
import { DOS_DISPLAY, DOS_UI } from "@/lib/design/tokens";
import type { Room } from "@/types/room";
import { DeskAddButton } from "@/features/settings/components/settings-kit";

/** The studio's rooms — lifted from the prototype's business settings Rooms
 *  segment (DanceOSApp.jsx:18389-18425). One studio = one location, so these are
 *  THIS studio's rooms; another branch is another studio.
 *
 *  ⚠⚠ A CARD PER ROOM, AND NOTHING EDITED IN PLACE (4 Oct 2026, the user: "add
 *  room form to have amenities in it and edit only from editing form now not
 *  outside. new asset card design how we did for other pages"). The card SHOWS
 *  the room: its name at a profile's size, its capacity and how many amenities
 *  as figures, the amenities as chips; Edit opens the one form, which is also
 *  where a room is added.
 *
 *  ⚠ AND THE SECOND PASS THE SAME DAY (the user: "room card- hold to be changed
 *  to Capacity. room cannot be deleted if classes are alredy published for it.
 *  remove text below room at end of page. studio name with profile pic and full
 *  address in section between the add room button and the cards. so can remove
 *  from below heading", then "make page quicker for opening add room form and it
 *  being created. and for edit"):
 *   · the studio — its picture, its name, its full address — is the MIDDLE
 *     section, and the "📍 area · name" line under the heading is gone;
 *   · a room holding a published class still to run offers no Remove, and says
 *     why — the server refuses it too (`softDeleteRoom`);
 *   · the form opens from THIS component's state and the list is redrawn from
 *     what the save hands back, so nothing waits on a page read. */

const TINT = DOS_TOOLS.rooms.c;

type Sheet = { mode: "new"; draft?: RoomDraft } | { mode: "edit"; room: Room; draft?: RoomDraft } | null;

export function RoomsManager({
  businessId,
  businessName,
  businessPhotoPath,
  businessAddress,
  rooms,
  inUse,
  initialSheet = null,
  canEdit = true,
}: {
  businessId: string;
  businessName: string;
  businessPhotoPath: string | null;
  /** the studio's full address — off its map pin where there is one */
  businessAddress: string;
  rooms: Room[];
  /** room id → published classes still to run in it */
  inUse: Record<string, number>;
  /** a `?new=1` or `?edit={room}` link opens the form on arrival */
  initialSheet?: Sheet;
  /** ⚠ may this seat WRITE a room — owner or manager since 28 Sep 2026, which is
   *  what the two policies on `rooms` admit */
  canEdit?: boolean;
}) {
  /* the list the desk draws — the server's, adopted again whenever the server
     sends a new one (a deletion revalidates the page), and patched in place by a
     save so the card is there the moment the press lands */
  const [list, setList] = useState(rooms);
  const [fromServer, setFromServer] = useState(rooms);
  if (rooms !== fromServer) {
    setFromServer(rooms);
    setList(rooms);
  }
  const [sheet, setSheet] = useState<Sheet>(initialSheet);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };

  /* rooms drawn ahead of their save — dimmed, with no buttons, until it lands */
  const [saving, setSaving] = useState<Set<string>>(() => new Set());
  const mark = (id: string, on: boolean) =>
    setSaving((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  /* ⚠ OPTIMISTIC (4 Oct 2026, the user: "make page quicker … it being created.
     and for edit"). The sheet closes and the card is drawn on the press; the save
     runs behind it. A new room wears a temporary id until the database's arrives.
     A refusal UNDOES the card and reopens the form with what was typed, so a
     "no" is never silent and nothing typed is lost. */
  const submit = async (current: Exclude<Sheet, null>, d: RoomDraft) => {
    setSheet(null);
    setError(null);
    if (current.mode === "new") {
      const tmp = `tmp-${Date.now()}`;
      setList((cur) => [...cur, { id: tmp, businessId, name: d.name, capacity: d.capacity, amenities: d.amenities }]);
      mark(tmp, true);
      const out = await createRoomAction({ businessId, ...d });
      mark(tmp, false);
      if (out.error || !out.room) {
        setList((cur) => cur.filter((r) => r.id !== tmp));
        setSheet({ mode: "new", draft: d });
        fire(out.error ?? "Could not add the room");
        return;
      }
      const real = out.room;
      setList((cur) => cur.map((r) => (r.id === tmp ? real : r)));
      fire("● Room added");
      return;
    }
    const before = current.room;
    setList((cur) => cur.map((r) => (r.id === before.id ? { ...r, ...d } : r)));
    mark(before.id, true);
    const out = await updateRoomAction({ businessId, roomId: before.id, ...d });
    mark(before.id, false);
    if (out.error || !out.room) {
      setList((cur) => cur.map((r) => (r.id === before.id ? before : r)));
      setSheet({ mode: "edit", room: before, draft: d });
      fire(out.error ?? "Could not save the room");
      return;
    }
    const real = out.room;
    setList((cur) => cur.map((r) => (r.id === real.id ? real : r)));
    fire("● Room saved");
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
    setList((cur) => cur.filter((x) => x.id !== r.id));
    fire(`${r.name} removed`);
  };

  return (
    <div style={{ maxWidth: 430, margin: "0 auto", padding: "0 16px 40px", fontFamily: DOS_UI, color: "var(--text)" }}>
      <DeskTop style={{ paddingBottom: 2 }}>
        {/* the shared tool hero — the page's own `<h1>` (22 Sep 2026) */}
        <DeskHero tool="rooms" as="h1" margin="0 0 12px" />
        {/* ⚠ only for somebody who may actually edit one (21 Sep 2026) */}
        {!canEdit ? (
          <div role="status" style={{ background: "var(--card)", borderRadius: 14, padding: 12, fontSize: 12, color: "var(--sub)", lineHeight: 1.5 }}>
            These are the studio&rsquo;s rooms. Changing them is the owner&rsquo;s and the managers&rsquo;.
          </div>
        ) : (
          <DeskAddButton label="Add room" onClick={() => setSheet({ mode: "new" })} />
        )}
      </DeskTop>

      {/* THE STUDIO — between the Add room button and the cards (4 Oct 2026) */}
      <DeskMiddle>
        <div data-testid="rooms-studio" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ToolFace name={businessName} photoPath={businessPhotoPath} tint={TINT} size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", color: TINT }}>Studio</div>
            <div style={{ fontFamily: DOS_DISPLAY, fontSize: 17, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.2, overflowWrap: "anywhere" }}>{businessName}</div>
            <div data-testid="rooms-studio-address" style={{ fontSize: 11.5, color: "var(--sub)", lineHeight: 1.45, marginTop: 3, overflowWrap: "anywhere" }}>
              📍 {businessAddress}
            </div>
          </div>
        </div>
      </DeskMiddle>

      <DeskBody>
        {list.map((r) => {
          const amen = DOS_AMENITIES.filter((a) => r.amenities.includes(a));
          const held = inUse[r.id] ?? 0;
          const pending = saving.has(r.id);
          return (
            <ToolCard key={r.id} testId="room-card" dim={pending}>
              <ToolHead
                tint={TINT}
                name={r.name}
                photoPath={null}
                eyebrow={pending ? "Room · saving…" : "Room"}
                icon={<span aria-hidden="true" style={{ fontSize: 24 }}>🚪</span>}
              />
              <ToolBody>
                <ToolFacts
                  tint={TINT}
                  items={[
                    /* ⚠ "Capacity", not "Holds" (4 Oct 2026, the user) */
                    { label: "Capacity", value: r.capacity, testId: "room-capacity" },
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
                {held > 0 && canEdit ? (
                  <div data-testid="room-in-use" style={{ fontSize: 11, color: "var(--sub)", fontWeight: 700, marginTop: 10 }}>
                    {held} published {held === 1 ? "class" : "classes"} still to run here — it can&rsquo;t be removed until {held === 1 ? "it is" : "they are"} moved or taken down.
                  </div>
                ) : null}
              </ToolBody>
              {canEdit && !pending ? (
                <ToolActions>
                  <button type="button" onClick={() => setSheet({ mode: "edit", room: r })} aria-label={`Edit ${r.name}`} style={toolBtn("tinted", TINT)}>
                    Edit
                  </button>
                  {/* ⚠ no Remove while a published class is still to run in it */}
                  {list.length > 1 && held === 0 ? (
                    <button type="button" disabled={busy} onClick={() => void remove(r)} aria-label={`Remove ${r.name}`} style={toolBtn("danger", TINT)}>
                      Remove
                    </button>
                  ) : null}
                </ToolActions>
              ) : null}
            </ToolCard>
          );
        })}
        {list.length === 0 ? (
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>No rooms yet — add the first one above, and your classes can be held in it.</div>
        ) : null}

        {error ? <div role="alert" style={{ fontSize: 11.5, color: "#EF4444", fontWeight: 700, marginTop: 10 }}>{error}</div> : null}
      </DeskBody>

      {sheet && canEdit ? (
        <RoomForm
          key={sheet.mode === "edit" ? sheet.room.id : "new"}
          defaultName={sheet.mode === "edit" ? sheet.room.name : `Room ${list.length + 1}`}
          room={sheet.mode === "edit" ? sheet.room : undefined}
          draft={sheet.draft}
          onClose={() => setSheet(null)}
          onSubmit={(d) => void submit(sheet, d)}
        />
      ) : null}

      {/* ⚠ `pointerEvents: none` — the toast sits over the form's Save bar, and
          for its 2.2 s it swallowed the press of the next Save (found timing the
          edit, 4 Oct 2026: 1.4–1.9 s that were the toast, not the network) */}
      {toast ? (
        <div role="status" aria-live="polite" style={{ pointerEvents: "none", position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", boxShadow: "0 6px 24px rgba(0,0,0,.45)", color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650 }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
