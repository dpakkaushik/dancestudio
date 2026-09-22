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
import { createRoomAction } from "@/features/rooms/server-actions/rooms";
import { DOS_TOOLS } from "@/features/tenants/components/biz-kit";
import { SUB } from "@/lib/design/tokens";

/** ADD ROOM — the form, on the app's one form anatomy (22 Sep 2026, the user:
 *  *"form for adding asset and adding room should be same way"*).
 *
 *  ⚠ THERE WAS NO FORM AT ALL. Pressing ＋ on the Rooms desk called
 *  `createRoomAction({ name: \`Room ${n + 1}\`, capacity: 20 })` on the spot — a
 *  room appeared, named after a counter, holding a number nobody had chosen, and
 *  you then corrected both on the row. That is fine for a studio adding its
 *  second floor and wrong for the one control in this app that decides how many
 *  people may book a class: capacity is a rule the database enforces, and it was
 *  being set by a default.
 *
 *  So it is asked for, with the old defaults PREFILLED — the same one press when
 *  the answer is the same, and a visible answer when it is not.
 *
 *  ⚠ AMENITIES ARE NOT HERE, deliberately. An existing room's are toggled on its
 *  own row, folded away until you want them (18389-18425), and offering them in
 *  two places is two doors to one job — the shape this file has recorded the cost
 *  of three times. A new room gets none, exactly as it did before.
 *
 *  ⚠ AND IT IS A SHEET ONLY — there is no `/business/{id}/rooms/new` to keep
 *  (Rule 14 protects addresses that were handed out; this one never existed). */

export function RoomForm({ tenantId, tenantName, defaultName }: { tenantId: string; tenantName: string; defaultName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [name, setName] = useState(defaultName);
  const [capacity, setCapacity] = useState("20");

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  const cap = Number(capacity);
  const blockers: string[] = [];
  if (!name.trim()) blockers.push("Name the room first");
  if (!Number.isFinite(cap) || cap < 1) blockers.push("A room holds at least one person");
  if (cap > 500) blockers.push("That is more than a room holds");
  const ready = blockers.length === 0;

  const save = () =>
    start(async () => {
      const out = await createRoomAction({ tenantId, name: name.trim(), capacity: cap });
      setConfirm(false);
      if (out.error) return fire(out.error);
      fire("● Room added");
      /* the desk is already underneath — `back()` spends the `?new=1` entry that
         opened this and `refresh()` re-runs its read (22 Sep 2026) */
      setTimeout(() => {
        router.back();
        router.refresh();
      }, 600);
    });

  return (
    <FormPage title="Add room" sheet onClose={() => router.back()} onBack={() => router.back()}>
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

        <FormNote blockers={blockers.length ? blockers : undefined}>
          This caps every class held here, and no two published classes may share the room at the same hour — both are kept by the database, not by this form. Amenities are set on the room&rsquo;s own row.
        </FormNote>
      </>

      <FormBar>
        <button type="button" aria-disabled={!ready} onClick={() => (ready ? setConfirm(true) : fire(blockers[0]))} style={{ ...formPrimary(ready), flex: 1 }}>
          {ready ? "Add room" : blockers[0]}
        </button>
      </FormBar>

      {confirm ? (
        <FormConfirm
          label="Add this room?"
          title="Add this room?"
          sub="A new LOCATION is a new studio — this is another floor at the same address. You can rename it or change what it holds any time."
          confirmWord={pending ? "Adding…" : "Add it"}
          busy={pending}
          onCancel={() => setConfirm(false)}
          onConfirm={save}
        >
          <FormSummary tint={DOS_TOOLS.rooms.c} head={<span style={{ fontSize: 11.5, fontWeight: 800 }}>● Holds {cap || 0}</span>}>
            <b style={{ fontSize: 15 }}>{name.trim()}</b>
            <div style={{ fontSize: 12, color: SUB, marginTop: 4 }}>At {tenantName}</div>
          </FormSummary>
        </FormConfirm>
      ) : null}

      <FormToast msg={toast} />
    </FormPage>
  );
}
