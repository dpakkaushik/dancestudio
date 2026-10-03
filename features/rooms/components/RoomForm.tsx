"use client";

import { useState } from "react";
import { FORM_LABEL, FORM_INPUT, FormBar, FormNote, FormPage, FormToast, formPrimary } from "@/components/ui/FormPage";
import { DOS_AMENITIES } from "@/lib/constants/amenities";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import type { Room } from "@/types/room";
import { AmenityIcon, amenityLabel } from "@/components/ui/AmenityIcon";
import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";

const TINT = DOS_TOOLS.rooms.c;

/** ADD ROOM / EDIT ROOM — the form, on the app's one form anatomy (22 Sep 2026,
 *  the user: *"form for adding asset and adding room should be same way"*).
 *
 *  ⚠ THERE WAS NO FORM AT ALL until 22 Sep: pressing ＋ created "Room N" holding
 *  twenty people nobody had chosen. Capacity is a rule the database enforces on
 *  every booking, so it is asked for, with the old defaults PREFILLED.
 *
 *  ⚠⚠ AMENITIES ARE HERE NOW, AND THIS IS THE ONLY PLACE A ROOM CHANGES (4 Oct
 *  2026, the user: *"add room form to have amenities in it and edit only from
 *  editing form now not outside"*). Until today a room's name and capacity were
 *  inputs on its own row, committed on blur, and its amenities were toggles
 *  folded under it — three things editable in place, each a write on a press.
 *  The desk shows a room now; Edit opens this same form at `?edit={room}`, and
 *  nothing is written until Save. One door to one job.
 *
 *  ⚠ AND IT IS A SHEET ONLY — there is no `/business/{id}/rooms/new` to keep
 *  (Rule 14 protects addresses that were handed out; this one never existed).
 *
 *  ⚠⚠ QUICK, BY THREE CUTS (4 Oct 2026, the user: "make page quicker for opening
 *  add room form and it being created. and for edit"):
 *   1. it opens from the DESK'S OWN STATE — no navigation, so no server round
 *      trip before it appears. It still owns a history entry (`useCloseOnBack`),
 *      so system back closes it.
 *   2. ONE PRESS SAVES — the confirm sheet over a three-field form was a second
 *      press saying back what the form already shows, and the 600 ms pause went
 *      with it.
 *   3. the desk draws the room AT ONCE and saves it behind the card (`onSubmit`)
 *      — no `back()` plus `refresh()`, which was a second full page read after
 *      every save, and no wait on the write either. A refusal undoes the card
 *      and reopens this form with what was typed. */

export interface RoomDraft {
  name: string;
  capacity: number;
  amenities: string[];
}

export function RoomForm({
  defaultName,
  room,
  draft,
  onClose,
  onSubmit,
}: {
  defaultName: string;
  room?: Room;
  /** what was typed last time, when a save came back refused — so nothing is lost */
  draft?: RoomDraft;
  onClose: () => void;
  /** ⚠ OPTIMISTIC (4 Oct 2026): the desk draws the room the moment this is
   *  called and saves it behind the card — a save is a network round trip
   *  (~0.9 s measured), and nobody should watch a sheet for it */
  onSubmit: (draft: RoomDraft) => void;
}) {
  useCloseOnBack(onClose);
  const editing = Boolean(room);
  const [toast, setToast] = useState<string | null>(null);
  const [name, setName] = useState(draft?.name ?? room?.name ?? defaultName);
  const [capacity, setCapacity] = useState(String(draft?.capacity ?? room?.capacity ?? 20));
  const [amenities, setAmenities] = useState<string[]>(draft?.amenities ?? room?.amenities ?? []);

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  const toggle = (a: string) => setAmenities((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));

  const cap = Number(capacity);
  const blockers: string[] = [];
  if (!name.trim()) blockers.push("Name the room first");
  if (!Number.isFinite(cap) || cap < 1) blockers.push("A room holds at least one person");
  if (cap > 500) blockers.push("That is more than a room holds");
  const ready = blockers.length === 0;
  /* in the registry's own order, whatever order they were pressed in */
  const ordered = DOS_AMENITIES.filter((a) => amenities.includes(a));

  const save = () => onSubmit({ name: name.trim(), capacity: cap, amenities: ordered });

  const title = editing ? "Edit room" : "Add room";
  return (
    <FormPage title={title} sheet onClose={onClose} onBack={onClose}>
      <>
        <div style={FORM_LABEL}>ROOM NAME</div>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="e.g. Studio A" aria-label="Room name" style={FORM_INPUT} />

        <div style={FORM_LABEL}>HOW MANY IT HOLDS</div>
        <input
          value={capacity}
          onChange={(e) => setCapacity(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="e.g. 20"
          aria-label="How many it holds"
          inputMode="numeric"
          style={FORM_INPUT}
        />

        <div style={FORM_LABEL}>AMENITIES</div>
        {/* ⚠ A GRID OF TILES, EACH THE AMENITY'S DRAWN ICON OVER ITS WORDS (4 Oct
            2026, the user: "even in room form change icons") — the emoji stays in
            the stored value and is not drawn; the accessible name is the words */}
        <div role="group" aria-label="Amenities" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 7 }}>
          {DOS_AMENITIES.map((a) => {
            const on = amenities.includes(a);
            const words = amenityLabel(a);
            return (
              <button
                type="button"
                key={a}
                aria-pressed={on}
                aria-label={words}
                onClick={() => toggle(a)}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  minHeight: 70,
                  padding: "10px 6px 9px",
                  borderRadius: 14,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  background: on ? `${TINT}1f` : "var(--card)",
                  color: on ? "var(--text)" : "var(--sub)",
                  border: `1.5px solid ${on ? TINT : "var(--el)"}`,
                  transition: "background .15s, border-color .15s",
                }}
              >
                <AmenityIcon value={a} size={22} color={on ? TINT : "var(--sub)"} />
                <span style={{ fontSize: 11, fontWeight: on ? 800 : 700, lineHeight: 1.2, textAlign: "center" }}>{words}</span>
                {on ? (
                  <span aria-hidden="true" style={{ position: "absolute", top: 6, right: 6, width: 15, height: 15, borderRadius: 999, background: TINT, color: "#fff", fontSize: 9, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <FormNote blockers={blockers.length ? blockers : undefined} />
      </>

      <FormBar>
        <button type="button" aria-disabled={!ready} onClick={() => (ready ? save() : fire(blockers[0]))} style={{ ...formPrimary(ready), flex: 1 }}>
          {ready ? (editing ? "Save room" : "Add room") : blockers[0]}
        </button>
      </FormBar>

      <FormToast msg={toast} />
    </FormPage>
  );
}
