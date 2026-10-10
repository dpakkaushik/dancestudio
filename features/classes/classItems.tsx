import Link from "next/link";
import type { ReactNode } from "react";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { AnswerButtons, DoorButtons, DraftButtons, ShareButton, StateChip, WithdrawButton, cardBtn } from "@/features/classes/components/ClassCardActions";
import type { AnsweredRow, ClassItem } from "@/features/classes/components/ClassesHome";
import { draftStateOf, type TimeGroup } from "@/features/classes/classesScreen";
import type { RequestItem } from "@/features/inbox/components/InboxScreen";
import { ASK_STATUS_WORD } from "@/lib/format/classLabels";
import type { ClassPublishState } from "@/repositories/classes";
import type { RefundLedgerRow } from "@/repositories/refunds";
import type { DanceClass } from "@/types/class";
import type { ClassArtist } from "@/types/classPerson";

/** THE CLASSES SCREEN'S CARDS, BUILT ON THE SERVER (11 Oct 2026) — one builder
 *  for a person's `/my-classes` and a studio's register, so the same state gets
 *  the same buttons on both. A plain module: it renders client buttons, it is
 *  not one. */

const WHEN = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
export const whenWords = (iso: string | null | undefined) => (iso ? WHEN.format(new Date(iso)) : "No date");

/** "to teach" · "to assist" · "for a room" — an ask in three words */
const askWords = (r: RequestItem) => (r.kind === "venue" ? "for a room" : r.relation === "askedToAssist" ? "to assist" : "to teach");

const ANSWER_TINT: Record<string, string> = { confirmed: "#22C55E", rejected: "#F87171", withdrawn: "#858585", asked: "#F59E0B" };

/** an ask put to you — the class card, who is asking, Decline · Accept */
export function askToYouItem(r: RequestItem, artist: ClassArtist | null, role: string, canAnswer = true): ClassItem {
  /* ⚠ a room is the studio OWNER's to give — a manager sees the ask, not the buttons */
  const actions = (
    <>
      <StateChip word={r.kind === "venue" ? `${r.who} wants a room` : `From ${r.who}`} tint="#F59E0B" />
      {canAnswer ? <AnswerButtons title={r.subjectTitle} classPersonId={r.classPersonId} venueClassId={r.kind === "venue" ? r.classId : undefined} /> : null}
    </>
  );
  return {
    key: `ask-${r.kind}-${r.id}`,
    tab: "todo",
    section: "answer",
    role,
    node: r.danceClass ? (
      <ClassTile danceClass={r.danceClass} artist={artist} href={r.href ?? undefined} relation={r.relation ?? null} actions={actions} />
    ) : (
      <PlainCard title={r.subjectTitle} sub={`${r.who} asked you ${askWords(r)}`}>
        {actions}
      </PlainCard>
    ),
  };
}

/** an ask you sent that is still unanswered — the card and Withdraw */
export function askYouSentItem(r: RequestItem, artist: ClassArtist | null, role: string): ClassItem {
  const actions = (
    <>
      <StateChip word={`Waiting on ${r.who}`} tint="#F59E0B" />
      {r.classPersonId ? <WithdrawButton title={r.subjectTitle} classPersonId={r.classPersonId} /> : null}
    </>
  );
  return {
    key: `sent-${r.kind}-${r.id}`,
    tab: "todo",
    section: "waiting",
    role,
    node: r.danceClass ? (
      <ClassTile danceClass={r.danceClass} artist={artist} href={r.href ?? undefined} relation={r.relation ?? null} actions={actions} />
    ) : (
      <PlainCard title={r.subjectTitle} sub={`You asked ${r.who} ${askWords(r)}`}>
        {actions}
      </PlainCard>
    ),
  };
}

/** a draft — its state in a chip and the one way forward */
export function draftItem({
  c,
  businessId,
  state,
  askedTeacherId,
  canEdit,
  artist,
  filled,
  role,
}: {
  c: DanceClass;
  businessId: string;
  state: ClassPublishState | undefined;
  askedTeacherId: string | null;
  canEdit: boolean;
  artist: ClassArtist | null;
  filled: number;
  role: string;
}): ClassItem {
  const ds = draftStateOf(state);
  return {
    key: `draft-${c.id}`,
    tab: "todo",
    /* a draft waiting on somebody else's yes is not waiting on you */
    section: ds.kind === "waiting" ? "waiting" : "mine",
    role,
    node: (
      <ClassTile
        danceClass={c}
        filled={filled}
        artist={artist}
        href={`/c/${c.shareSlug}`}
        actions={
          <DraftButtons
            businessId={businessId}
            classId={c.id}
            title={c.title}
            when={whenWords(c.session?.startsAt)}
            capacity={c.capacity}
            room={c.room}
            roomId={c.roomId}
            startsAt={c.session?.startsAt ?? null}
            endsAt={c.session?.endsAt ?? null}
            isVenueClass={Boolean(c.venueBusinessId)}
            state={ds}
            askedTeacherId={askedTeacherId}
            canEdit={canEdit}
          />
        }
      />
    ),
  };
}

/** a class you said yes to that its studio has not published yet — nothing to
 *  press, so it waits in To do rather than sitting in Upcoming with a Share
 *  button for a page nobody else can open */
export function unpublishedItem({ key, c, artist, filled, role, relation }: { key: string; c: DanceClass; artist: ClassArtist | null; filled: number; role: string; relation: "teaching" | "assisting" }): ClassItem {
  return {
    key,
    tab: "todo",
    section: "waiting",
    role,
    node: <ClassTile danceClass={c} filled={filled} artist={artist} href={`/c/${c.shareSlug}`} relation={relation} actions={<StateChip word={`Waiting on ${c.owner?.name ?? "the studio"} to publish`} tint="#F59E0B" />} />,
  };
}

/** the refunds waiting on a decision — one row, one press */
export function refundsItem(refunds: RefundLedgerRow[], href: string, role: string): ClassItem | null {
  const asked = refunds.filter((r) => r.status === "requested");
  if (asked.length === 0) return null;
  const sum = asked.reduce((t, r) => t + r.amountInr, 0);
  return {
    key: "refunds",
    tab: "todo",
    section: "mine",
    role,
    node: (
      <PlainCard title={`${asked.length} refund ${asked.length === 1 ? "request" : "requests"}`} sub={`₹${sum.toLocaleString("en-IN")} asked back`} testId="todo-refunds">
        <Link href={href} style={cardBtn(true)}>
          Decide
        </Link>
      </PlainCard>
    ),
  };
}

/** THE BUTTONS ON A CLASS YOU RUN, by where it is in time: the door while it is
 *  open, the register and a share before, the register after */
export function runActions({ group, path, title, canDoor, canShare = true }: { group: TimeGroup; path: string; title: string; canDoor: boolean; canShare?: boolean }): ReactNode {
  if (group === "now") return canDoor ? <DoorButtons path={path} title={title} scan /> : null;
  if (group === "past") return canDoor ? <DoorButtons path={path} title={title} scan={false} /> : null;
  return (
    <>
      {canShare ? <ShareButton path={path} title={title} /> : null}
      {canDoor ? <DoorButtons path={path} title={title} scan={false} /> : null}
    </>
  );
}

/** the answered asks, both ways, newest first — the folded history in To do */
export function answeredRows(requestsIn: RequestItem[], requestsOut: RequestItem[]): AnsweredRow[] {
  return [
    ...requestsIn.filter((r) => r.status && r.status !== "asked").map((r) => ({ r, line: `${r.who} asked you ${askWords(r)}` })),
    ...requestsOut.filter((r) => r.status && r.status !== "asked").map((r) => ({ r, line: `You asked ${r.who} ${askWords(r)}` })),
  ]
    .sort((a, b) => b.r.at.localeCompare(a.r.at))
    .slice(0, 30)
    .map(({ r, line }) => ({
      key: `${r.dir}-${r.kind}-${r.id}`,
      line,
      subject: r.subjectTitle,
      word: ASK_STATUS_WORD[r.status ?? "asked"],
      tint: ANSWER_TINT[r.status ?? "asked"] ?? "#858585",
    }));
}

function PlainCard({ title, sub, children, testId }: { title: string; sub: string; children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} style={{ padding: "13px 14px", marginBottom: 12, borderRadius: 20, background: "var(--card)", border: "1.5px solid var(--el)" }}>
      <div style={{ fontSize: 14, fontWeight: 900, lineHeight: 1.3 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>{sub}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>{children}</div>
    </div>
  );
}
