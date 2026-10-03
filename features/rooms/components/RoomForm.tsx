"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  FORM_LABEL,
  FORM_INPUT,
  FormBar,
  FormConfirm,
  FormNote,
  FormPage,
  FormSummary,
  FormToast,
  formPrimary,
} from "@/components/ui/FormPage";
import { createRoomAction, updateRoomAction } from "@/features/rooms/server-actions/rooms";
import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import { DOS_AMENITIES } from "@/lib/constants/amenities";
import { SUB } from "@/lib/design/tokens";
import type { Room } from "@/types/room";

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
 *  (Rule 14 protects addresses that were handed out; this one never existed). */

export function RoomForm({ businessId, businessName, defaultName, room }: { businessId: string; businessName: string; defaultName: string; room?: Room }) {
  const router = useRouter();
  const editing = Boolean(room);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [name, setName] = useState(room?.name ?? defaultName);
  const [capacity, setCapacity] = useState(String(room?.capacity ?? 20));
  const [amenities, setAmenities] = useState<string[]>(room?.amenities ?? []);

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

  const save = () =>
    start(async () => {
      const out = room
        ? await updateRoomAction({ businessId, roomId: room.id, name: name.trim(), capacity: cap, amenities: ordered })
        : await createRoomAction({ businessId, name: name.trim(), capacity: cap, amenities: ordered });
      setConfirm(false);
      if (out.error) return fire(out.error);
      fire(room ? "● Room saved" : "● Room added");
      /* the desk is already underneath — `back()` spends the entry that opened
         this and `refresh()` re-runs its read (22 Sep 2026) */
      setTimeout(() => {
        router.back();
        router.refresh();
      }, 600);
    });

  const title = editing ? "Edit room" : "Add room";
  return (
    <FormPage title={title} sheet onClose={() => router.back()} onBack={() => router.back()}>
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
        <div role="group" aria-label="Amenities" style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {DOS_AMENITIES.map((a) => {
            const on = amenities.includes(a);
            return (
              <button
                type="button"
                key={a}
                aria-pressed={on}
                onClick={() => toggle(a)}
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  padding: "7px 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  background: on ? "var(--text)" : "var(--card)",
                  color: on ? "var(--solid)" : "var(--sub)",
                  border: `1.5px solid ${on ? "var(--text)" : "var(--el)"}`,
                }}
              >
                {a}
                {on ? " ✓" : ""}
              </button>
            );
          })}
        </div>

        <FormNote blockers={blockers.length ? blockers : undefined} />
      </>

      <FormBar>
        <button type="button" aria-disabled={!ready} onClick={() => (ready ? setConfirm(true) : fire(blockers[0]))} style={{ ...formPrimary(ready), flex: 1 }}>
          {ready ? (editing ? "Save room" : "Add room") : blockers[0]}
        </button>
      </FormBar>

      {confirm ? (
        <FormConfirm
          label={editing ? "Save this room?" : "Add this room?"}
          title={editing ? "Save this room?" : "Add this room?"}
          confirmWord={pending ? (editing ? "Saving…" : "Adding…") : editing ? "Save it" : "Add it"}
          busy={pending}
          onCancel={() => setConfirm(false)}
          onConfirm={save}
        >
          <FormSummary tint={DOS_TOOLS.rooms.c} head={<span style={{ fontSize: 11.5, fontWeight: 800 }}>● Holds {cap || 0}</span>}>
            <b style={{ fontSize: 15 }}>{name.trim()}</b>
            <div style={{ fontSize: 12, color: SUB, marginTop: 4 }}>At {businessName}</div>
            {ordered.length ? <div style={{ fontSize: 11.5, color: SUB, marginTop: 4 }}>{ordered.join("  ")}</div> : null}
          </FormSummary>
        </FormConfirm>
      ) : null}

      <FormToast msg={toast} />
    </FormPage>
  );
}
