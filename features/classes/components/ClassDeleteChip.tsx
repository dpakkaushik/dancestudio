"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deleteClassAction } from "@/features/classes/server-actions/classes";

/** DELETE, ON THE TOP RIGHT OF THE CLASS PAGE (4 Oct 2026, the user: "delete
 *  class removed from class card and goes on top right of class detail page").
 *
 *  The same act the register's row used to offer, with the same words: a draft
 *  nobody can have booked is a plain delete; a published class with people on it
 *  says they must be refunded and its button reads "Delete & manage refunds" —
 *  and since 30 Sep 2026 that promise is true (`softDeleteClass` calls the class
 *  off and files a refund per paid seat before the row goes).
 *
 *  ⚠ THE OWNER'S, AND NEVER ONCE THE CLASS IS OVER — the page decides both before
 *  drawing this; `softDeleteClass` and `cancel_class_bookings_for_class` refuse
 *  both again, in words.
 *
 *  ⚠ ON SUCCESS IT NAVIGATES INSTEAD OF CLOSING (`useCloseOnBack` rule 2): a
 *  close spends the dialog's history entry with a `back()`, and a back racing a
 *  `router.replace` cancels the replace. Replacing FROM the dialog's own entry
 *  takes that entry with it, and the route change unmounts the dialog. */
export function ClassDeleteChip({
  classId,
  businessId,
  title,
  isDraft,
  enrolled,
  priceInr = 0,
  paidSeats = 0,
}: {
  classId: string;
  businessId: string;
  title: string;
  isDraft: boolean;
  /** live seats on the class — what the question has to say about money */
  enrolled: number;
  /** the seat price — a free class has nothing to refund (B18, 11 Oct 2026) */
  priceInr?: number;
  /** seats paid ONLINE — the ones a call-off sends money back for; a pass gets
   *  its hours back and a door seat was collected by hand */
  paidSeats?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set("classId", classId);
    fd.set("businessId", businessId);
    const out = await deleteClassAction({ error: null }, fd);
    if (out.error) {
      setBusy(false);
      setErr(out.error);
      return;
    }
    /* a deleted class no longer resolves at its own link: with people refunded
       the next screen is where those refunds are settled (the sentence promises
       it), and with nobody on it, the register it came off */
    router.replace(paid > 0 ? `/business/${businessId}/refunds` : `/business/${businessId}/classes`);
  };

  /* ⚠ HONEST PER CASE (11 Oct 2026, B18). It said "must be refunded" and sent
     the owner to the refunds desk for a FREE class too, where there was nothing
     to settle. Three cases now: nobody booked; booked but nothing paid online
     (free seats, passes, door cash); paid seats, which the call-off refunds
     through Cashfree by itself. */
  const paid = priceInr > 0 ? Math.min(paidSeats, enrolled) : 0;
  const ppl = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
  const ask = isDraft
    ? { title: "Delete this draft?", body: `${title} has never been published, so nobody has booked it — deleting it takes it off your list for good.`, word: "Delete draft" }
    : enrolled === 0
      ? { title: "Delete this published class?", body: `${title} comes off the listing immediately. Nobody has booked it, so there is nothing to refund.`, word: "Delete class" }
      : paid > 0
        ? {
            title: "Delete this published class?",
            body: `${title} · ${paid} enrolled ${paid === 1 ? "student" : "students"} must be refunded — the refunds go out through Cashfree by themselves, and you can follow them on the next screen. Everybody booked is told${enrolled > paid ? ", and a pass gets its hours back" : ""}.`,
            word: "Delete & manage refunds",
          }
        : {
            title: "Delete this published class?",
            body: priceInr > 0
              ? `${title} · ${ppl(enrolled)} booked. Nobody paid online, so nothing goes back through Cashfree — a pass gets its hours back. Everybody booked is told.`
              : `${title} · ${ppl(enrolled)} booked. It is free, so there is nothing to refund — their seats are cancelled and they are told.`,
            word: "Delete class",
          };

  return (
    <>
      <button
        type="button"
        data-testid="class-delete"
        aria-label={`Delete ${title}`}
        onClick={() => {
          setErr(null);
          setOpen(true);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 12px 7px 10px",
          borderRadius: 999,
          border: "1.5px solid rgba(248,113,113,.55)",
          background: "rgba(10,10,10,.62)",
          color: "#FCA5A5",
          fontSize: 11.5,
          fontWeight: 900,
          cursor: "pointer",
          fontFamily: "inherit",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
        </svg>
        Delete
      </button>
      {open ? (
        <ConfirmDialog
          title={ask.title}
          body={ask.body}
          goWord={ask.word}
          busy={busy}
          err={err}
          onKeep={() => (busy ? undefined : setOpen(false))}
          onGo={() => void go()}
        />
      ) : null}
    </>
  );
}
