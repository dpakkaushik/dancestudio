"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { checkRoomClashAction, publishClassAction, respondToVenueRequestAction, type RoomClash } from "@/features/classes/server-actions/classes";
import { respondToClassAskAction, withdrawClassAskAction } from "@/features/classPeople/server-actions/classPeople";
import type { DraftState } from "@/features/classes/classesScreen";

/** ⚠⚠ THE BUTTONS ON A CLASS CARD (11 Oct 2026, the user: "write buttons on class
 *  cards for doing proper action"). At most two per card, chosen by what the
 *  class is to you and where it is in time; anything rarer is on the class page.
 *  Each button refreshes the page it is on when its press lands, so the card
 *  moves to the tab it now belongs to. */

export const cardBtn = (primary: boolean): CSSProperties => ({
  flex: "1 1 0",
  minWidth: 0,
  textAlign: "center",
  padding: "11px 12px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 900,
  fontFamily: "inherit",
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
  border: primary ? "none" : "1.5px solid var(--el)",
  /* `--text` on `--solid`, never `--bg`: a card can sit inside an inverted panel */
  background: primary ? "var(--text)" : "var(--card)",
  color: primary ? "var(--solid)" : "var(--text)",
});

const greenBtn: CSSProperties = { ...cardBtn(true), background: "#22C55E", color: "#04220f" };

/** a short state chip that sits on the button bar, above the buttons */
export function StateChip({ word, tint }: { word: string; tint: string }) {
  return (
    <span data-testid="card-state" style={{ flexBasis: "100%", display: "flex" }}>
      <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.4, padding: "4px 9px", borderRadius: 999, background: `${tint}1f`, color: tint, textTransform: "uppercase" }}>{word}</span>
    </span>
  );
}

function ErrorLine({ text }: { text: string | null }) {
  return text ? (
    <span role="alert" style={{ flexBasis: "100%", fontSize: 11.5, color: "#F87171", fontWeight: 700 }}>
      {text}
    </span>
  ) : null;
}

/** ACCEPT · DECLINE — an ask put to you (teach / assist), or a room an artist
 *  asked your studio for. The Inbox's own RPCs decide who may answer. */
export function AnswerButtons({ title, classPersonId, venueClassId }: { title: string; classPersonId?: string; venueClassId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const answer = async (accept: boolean) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const out = venueClassId
      ? await respondToVenueRequestAction({ classId: venueClassId, accept })
      : await respondToClassAskAction({ classPersonId: classPersonId!, accept });
    setBusy(false);
    if (out.error) setErr(out.error);
    else router.refresh();
  };
  return (
    <>
      <button type="button" disabled={busy} aria-label={`Decline ${title}`} data-testid="card-decline" onClick={() => void answer(false)} style={cardBtn(false)}>
        Decline
      </button>
      <button type="button" disabled={busy} aria-label={`Accept ${title}`} data-testid="card-accept" onClick={() => void answer(true)} style={cardBtn(true)}>
        {busy ? "…" : "Accept"}
      </button>
      <ErrorLine text={err} />
    </>
  );
}

/** WITHDRAW — an ask you sent that nobody has answered yet */
export function WithdrawButton({ title, classPersonId }: { title: string; classPersonId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={busy}
        aria-label={`Withdraw the ask for ${title}`}
        data-testid="card-withdraw"
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const out = await withdrawClassAskAction({ classPersonId });
          setBusy(false);
          if (out.error) setErr(out.error);
          else router.refresh();
        }}
        style={cardBtn(false)}
      >
        {busy ? "…" : "Withdraw"}
      </button>
      <ErrorLine text={err} />
    </>
  );
}

const istParts = (iso: string) => ({
  date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)),
  time: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace("24", "00"),
});

/** A DRAFT'S BUTTONS: the one way forward its state allows. Ready → Publish
 *  (behind a question, the room asked first); a no → the edit form under the
 *  right words; waiting on a teacher → Withdraw. `canEdit` is the owner alone —
 *  RLS admits only the owner to `classes` UPDATE. */
export function DraftButtons({
  businessId,
  classId,
  title,
  when,
  capacity,
  room,
  roomId,
  startsAt,
  endsAt,
  isVenueClass,
  state,
  askedTeacherId,
  canEdit,
}: {
  businessId: string;
  classId: string;
  title: string;
  when: string;
  capacity: number;
  room: string | null;
  roomId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isVenueClass: boolean;
  state: DraftState;
  askedTeacherId: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState<{ clash: RoomClash } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const editHref = `/business/${businessId}/classes/${classId}/edit`;
  if (!canEdit) return <StateChip word={state.chip} tint={state.tint} />;

  const openPublish = async () => {
    setErr(null);
    let clash: RoomClash = null;
    if (roomId && startsAt && endsAt && !isVenueClass) {
      const s = istParts(startsAt);
      const e = istParts(endsAt);
      clash = await checkRoomClashAction({ businessId, roomId, date: s.date, startTime: s.time, endTime: e.time, excludeClassId: classId });
    }
    setAsking({ clash });
  };
  const publish = async () => {
    setBusy(true);
    const fd = new FormData();
    fd.set("classId", classId);
    fd.set("businessId", businessId);
    const out = await publishClassAction({ error: null }, fd);
    setBusy(false);
    if (out.error) {
      setErr(out.error);
      return;
    }
    setAsking(null);
    router.refresh();
  };

  return (
    <>
      <StateChip word={state.chip} tint={state.tint} />
      {state.kind === "ready" ? (
        <>
          <Link href={editHref} style={cardBtn(false)}>
            Edit
          </Link>
          <button type="button" data-testid="card-publish" aria-label={`Publish ${title}`} onClick={() => void openPublish()} style={greenBtn}>
            Publish
          </button>
        </>
      ) : state.kind === "fix" ? (
        <Link href={editHref} data-testid="card-fix" style={cardBtn(true)}>
          {state.fix === "studio" ? "Pick another studio" : state.fix === "teacher" ? "Ask someone else" : "Edit"}
        </Link>
      ) : (
        <>
          <Link href={editHref} style={cardBtn(false)}>
            Edit
          </Link>
          {askedTeacherId ? <WithdrawButton title={title} classPersonId={askedTeacherId} /> : null}
        </>
      )}
      <ErrorLine text={asking ? null : err} />
      {asking ? (
        asking.clash ? (
          <ConfirmDialog
            title="That room is taken"
            body={`${room ?? "The room"} already has ${asking.clash.label} at ${asking.clash.at}. Pick another slot.`}
            keepWord="Back"
            goWord="Change the slot"
            tone="go"
            onKeep={() => setAsking(null)}
            onGo={() => router.push(editHref)}
          />
        ) : (
          <ConfirmDialog
            title={`Publish ${title}?`}
            body={`${when} · ${capacity} places. It goes on sale at once.`}
            keepWord="Not yet"
            goWord="Publish"
            tone="go"
            busy={busy}
            err={err}
            onKeep={() => setAsking(null)}
            onGo={() => void publish()}
          />
        )
      ) : null}
    </>
  );
}

/** SCAN — the door of a class you run, while it is open. The class page opens
 *  straight onto the camera (`?open=scan`) and re-checks who may.
 *  ⚠ No Register button on a card (11 Oct 2026, the user: "remove register
 *  button from class cards") — the card itself opens the class page, whose
 *  Attendance tab is the register; `?open=register` still works for old links. */
export function ScanButton({ path, title }: { path: string; title: string }) {
  return (
    <Link href={`${path}?open=scan`} aria-label={`Scan a code at ${title}`} data-testid="card-scan" style={greenBtn}>
      Scan
    </Link>
  );
}

/** SHARE — the phone's own share sheet, or the link copied */
export function ShareButton({ path, title }: { path: string; title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Share ${title}`}
      data-testid="card-share"
      onClick={async () => {
        const url = `${window.location.origin}${path}`;
        try {
          if (navigator.share) {
            await navigator.share({ title, url });
            return;
          }
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          /* a cancelled share sheet is not an error */
        }
      }}
      style={cardBtn(false)}
    >
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
